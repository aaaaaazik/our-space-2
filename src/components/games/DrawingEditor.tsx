"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  Eraser,
  Highlighter,
  Maximize2,
  Palette,
  PenLine,
  Pencil,
  Redo2,
  Sparkles,
  Trash2,
  Type,
  Undo2,
} from "lucide-react";

import {
  COLORS,
  GLYPHS,
  PAPERS,
  SIZES,
  defaultInk,
  paintItems,
  paintPaper,
  paperSize,
  type Item,
  type Paper,
  type Stroke,
  type Tool,
} from "@/lib/games/artboard";
import { cn } from "@/lib/utils/cn";

type View = { scale: number; tx: number; ty: number };
type Panel = "none" | "colors" | "sizes" | "stamps" | "paper";
/** Штамп и текст ставятся касанием, а не ведением, поэтому стоят рядом с кистями. */
type Mode = Tool | "stamp" | "text";

const BRUSHES: Array<{ id: Tool; title: string; icon: typeof PenLine }> = [
  { id: "pen", title: "Ручка", icon: PenLine },
  { id: "pencil", title: "Карандаш", icon: Pencil },
  { id: "marker", title: "Маркер", icon: PenLine },
  { id: "highlighter", title: "Маркер-выделитель", icon: Highlighter },
];

/**
 * Полноэкранный редактор рисунка.
 *
 * Всё, что нарисовано, живёт в собственных единицах листа и рисуется
 * заново при каждом кадре: поэтому приближение даёт по-настоящему чёткую
 * линию, а не увеличенные пиксели.
 */
export function DrawingEditor({
  items,
  paper,
  onChange,
  onPaper,
  onClose,
}: {
  items: Item[];
  paper: Paper;
  onChange: (next: Item[]) => void;
  onPaper: (next: Paper) => void;
  onClose: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Всё, что меняется на каждом кадре, живёт в ref: перерисовка идёт
  // напрямую в холст, и лишние проходы React здесь только мешали бы.
  const itemsRef = useRef<Item[]>(items);
  const paperRef = useRef<Paper>(paper);
  const historyRef = useRef<Item[][]>([]);
  const futureRef = useRef<Item[][]>([]);
  const viewRef = useRef<View>({ scale: 1, tx: 0, ty: 0 });
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const drawingRef = useRef(false);
  const pinchRef = useRef<{
    dist: number;
    scale: number;
    midX: number;
    midY: number;
    tx: number;
    ty: number;
  } | null>(null);
  const frameRef = useRef(0);

  const [mode, setMode] = useState<Mode>("pen");
  const [color, setColor] = useState<string>(defaultInk(paper));
  const [width, setWidth] = useState<number>(SIZES[2]);
  const [glyph, setGlyph] = useState<string>(GLYPHS[0]);
  const [panel, setPanel] = useState<Panel>("none");
  const [zoomed, setZoomed] = useState(false);
  const [typing, setTyping] = useState<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState("");

  /*
    Производные от ref-ов держим в состоянии.

    Читать ref прямо в разметке нельзя: React не узнает, что значение
    изменилось, и кнопки останутся в прежнем виде. Поэтому всё, что видно
    на экране, обновляется явно — функцией sync после каждого изменения.
  */
  const [ui, setUi] = useState({
    canUndo: false,
    canRedo: false,
    hasItems: items.length > 0,
    unit: 0.36,
  });

  function sync() {
    setUi({
      canUndo: historyRef.current.length > 0,
      canRedo: futureRef.current.length > 0,
      hasItems: itemsRef.current.length > 0,
      unit: fitScale(),
    });
  }

  /** Насколько лист помещается в окно целиком — по обеим сторонам сразу. */
  function fitScale(): number {
    const box = boxRef.current;
    if (!box) return 1;

    const rect = box.getBoundingClientRect();
    const { w, h } = paperSize(paperRef.current);
    return Math.min(rect.width / w, rect.height / h);
  }

  function fit() {
    const box = boxRef.current;
    if (!box) return;

    const rect = box.getBoundingClientRect();
    const { w, h } = paperSize(paperRef.current);
    const scale = fitScale();

    viewRef.current = {
      scale,
      tx: (rect.width - w * scale) / 2,
      ty: (rect.height - h * scale) / 2,
    };
    setZoomed(false);
    sync();
  }

  /** Не даём уехать так, чтобы лист пропал с экрана. */
  function clamp() {
    const box = boxRef.current;
    if (!box) return;

    const rect = box.getBoundingClientRect();
    const view = viewRef.current;
    const { w, h } = paperSize(paperRef.current);
    const margin = 60;

    view.tx = Math.min(
      rect.width - margin,
      Math.max(margin - w * view.scale, view.tx),
    );
    view.ty = Math.min(
      rect.height - margin,
      Math.max(margin - h * view.scale, view.ty),
    );
  }

  /**
   * Собственно отрисовка.
   *
   * Первый раз вызывается сразу, а не с ближайшим кадром: если в этот
   * момент вкладка не на переднем плане, кадры не выдаются вовсе, и холст
   * остался бы пустым до возвращения.
   */
  function draw() {
    const canvas = canvasRef.current;
    const box = boxRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !box || !ctx) return;

    const rect = box.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    if (canvas.width !== Math.round(rect.width * dpr)) {
      canvas.width = Math.round(rect.width * dpr);
    }
    if (canvas.height !== Math.round(rect.height * dpr)) {
      canvas.height = Math.round(rect.height * dpr);
    }

    const view = viewRef.current;

    // Фон вокруг листа — чтобы было видно, где кончается бумага.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#0b0810";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.setTransform(
      dpr * view.scale,
      0,
      0,
      dpr * view.scale,
      dpr * view.tx,
      dpr * view.ty,
    );

    // Мягкая тень под листом: она и отделяет бумагу от фона.
    const { w, h } = paperSize(paperRef.current);
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
    ctx.shadowBlur = 40 / view.scale;
    ctx.shadowOffsetY = 12 / view.scale;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    paintPaper(ctx, paperRef.current);
    paintItems(ctx, itemsRef.current, paperRef.current);
  }

  /** Просит перерисовать не чаще одного раза за кадр. */
  function repaint() {
    if (frameRef.current) return;

    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      draw();
    });
  }

  useEffect(() => {
    fit();
    draw();

    const box = boxRef.current;
    if (!box) return;

    const observer = new ResizeObserver(() => {
      clamp();
      repaint();
    });
    observer.observe(box);

    return () => {
      observer.disconnect();

      /*
        Отменяя кадр, обязательно сбрасываем и метку о нём.

        В режиме разработки React намеренно прогоняет эффект дважды.
        Кадр при этом отменялся, а метка оставалась занятой — и repaint,
        увидев её, считал, что перерисовка уже назначена, и не назначал
        новую. Холст так и оставался пустым.
      */
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Пока редактор открыт, страница под ним не прокручивается.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  /** Экранная точка в единицы листа. */
  function toArt(clientX: number, clientY: number) {
    const box = boxRef.current;
    if (!box) return { x: 0, y: 0 };

    const rect = box.getBoundingClientRect();
    const view = viewRef.current;

    return {
      x: (clientX - rect.left - view.tx) / view.scale,
      y: (clientY - rect.top - view.ty) / view.scale,
    };
  }

  /** Запоминаем состояние до изменения — для отмены. */
  function remember() {
    historyRef.current.push(itemsRef.current.slice());
    if (historyRef.current.length > 80) historyRef.current.shift();
    futureRef.current = [];
  }

  function commit() {
    onChange(itemsRef.current);
    sync();
  }

  function onPointerDown(event: React.PointerEvent) {
    // Захват указателя не даёт линии оборваться, когда палец уходит за
    // край. Он умеет бросать исключение, если указателя уже нет, —
    // а обрывать из-за этого весь обработчик нельзя.
    try {
      (event.target as Element).setPointerCapture?.(event.pointerId);
    } catch {
      /* указатель уже отпущен — рисовать это не мешает */
    }

    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    if (pointersRef.current.size === 1) {
      const at = toArt(event.clientX, event.clientY);

      if (mode === "text") {
        setTyping(at);
        setDraft("");
        return;
      }

      if (mode === "stamp") {
        remember();
        itemsRef.current = [
          ...itemsRef.current,
          {
            kind: "stamp",
            glyph,
            size: width * 5,
            // Небольшой разброс поворота: одинаковые штампы иначе
            // выглядят печатью, а не россыпью.
            angle: (Math.random() - 0.5) * 0.7,
            x: at.x,
            y: at.y,
          },
        ];
        commit();
        repaint();
        return;
      }

      remember();
      drawingRef.current = true;
      itemsRef.current = [
        ...itemsRef.current,
        { kind: "stroke", tool: mode, color, width, points: [at] },
      ];
      repaint();
      return;
    }

    if (pointersRef.current.size === 2) {
      /*
        Второй палец — это приближение, а не рисование. Начатую точку
        убираем: касание вторым пальцем почти всегда чуть запаздывает,
        и без этого каждый жест оставлял бы кляксу.
      */
      if (drawingRef.current) {
        const last = itemsRef.current.at(-1);
        if (last?.kind === "stroke" && last.points.length <= 2) {
          itemsRef.current = itemsRef.current.slice(0, -1);
          historyRef.current.pop();
        }
        drawingRef.current = false;
      }

      const [a, b] = [...pointersRef.current.values()];
      const view = viewRef.current;

      pinchRef.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        scale: view.scale,
        midX: (a.x + b.x) / 2,
        midY: (a.y + b.y) / 2,
        tx: view.tx,
        ty: view.ty,
      };
      repaint();
    }
  }

  function onPointerMove(event: React.PointerEvent) {
    if (!pointersRef.current.has(event.pointerId)) return;

    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    const pinch = pinchRef.current;

    if (pinch && pointersRef.current.size >= 2) {
      const [a, b] = [...pointersRef.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;

      const base = fitScale();
      const scale = Math.min(
        base * 12,
        Math.max(base * 0.8, (pinch.scale * dist) / pinch.dist),
      );

      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const box = boxRef.current!.getBoundingClientRect();

      // Точка под пальцами должна остаться на месте: считаем, где она была
      // в единицах листа, и подгоняем сдвиг под новый масштаб.
      const artX = (pinch.midX - box.left - pinch.tx) / pinch.scale;
      const artY = (pinch.midY - box.top - pinch.ty) / pinch.scale;

      viewRef.current = {
        scale,
        tx: midX - box.left - artX * scale,
        ty: midY - box.top - artY * scale,
      };

      clamp();
      setZoomed(Math.abs(scale - base) > 0.001);
      repaint();
      return;
    }

    if (!drawingRef.current) return;

    const stroke = itemsRef.current.at(-1);
    if (stroke?.kind !== "stroke") return;

    /*
      Браузер копит промежуточные точки между кадрами — забираем их все,
      иначе быстрый росчерк выходит угловатым.

      Пустой список тоже возможен: не всякое событие несёт промежуточные
      точки. Тогда берём само событие — иначе движение потерялось бы
      целиком и от штриха осталась бы одна точка касания.
    */
    const native = event.nativeEvent as PointerEvent;
    const coalesced = native.getCoalescedEvents?.() ?? [];
    const points = coalesced.length > 0 ? coalesced : [native];

    for (const e of points) stroke.points.push(toArt(e.clientX, e.clientY));

    repaint();
  }

  function onPointerUp(event: React.PointerEvent) {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;

    if (pointersRef.current.size === 0 && drawingRef.current) {
      drawingRef.current = false;
      commit();
    }
  }

  function undo() {
    const previous = historyRef.current.pop();
    if (!previous) return;

    futureRef.current.push(itemsRef.current);
    itemsRef.current = previous;
    commit();
    repaint();
  }

  function redo() {
    const next = futureRef.current.pop();
    if (!next) return;

    historyRef.current.push(itemsRef.current);
    itemsRef.current = next;
    commit();
    repaint();
  }

  function clear() {
    if (itemsRef.current.length === 0) return;
    remember();
    itemsRef.current = [];
    commit();
    repaint();
  }

  function applyPaper(next: Paper) {
    paperRef.current = next;
    onPaper(next);

    // На тёмной бумаге чёрные чернила не видно — переводим на светлые,
    // и наоборот. Свой выбранный цвет при этом не трогаем.
    if (next.kind === "night" && color === "#111827") setColor("#ffffff");
    if (next.kind !== "night" && color === "#ffffff") setColor("#111827");

    fit();
    draw();
  }

  function addText() {
    if (!typing || draft.trim().length === 0) {
      setTyping(null);
      return;
    }

    remember();
    itemsRef.current = [
      ...itemsRef.current,
      {
        kind: "text",
        text: draft.trim(),
        color,
        size: width * 4,
        x: typing.x,
        y: typing.y,
      },
    ];
    setTyping(null);
    setDraft("");
    commit();
    repaint();
  }

  const brushing = mode !== "stamp" && mode !== "text";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0b0810]">
      <header className="flex shrink-0 items-center justify-between gap-2 px-3 pt-[max(0.6rem,env(safe-area-inset-top))] pb-2">
        <button
          type="button"
          onClick={() => {
            if (!zoomed) return;
            fit();
            draw();
          }}
          disabled={!zoomed}
          className={cn(
            "flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[13px] transition-colors",
            zoomed
              ? "bg-white/12 text-white/85"
              : "text-white/30",
          )}
        >
          <Maximize2 size={13} aria-hidden />
          {zoomed ? "Весь лист" : "Два пальца — приблизить"}
        </button>

        <div className="flex items-center gap-2">
          <Tool
            onClick={() => setPanel(panel === "paper" ? "none" : "paper")}
            active={panel === "paper"}
            label="Лист"
            small
          >
            <Palette size={17} aria-hidden />
          </Tool>

          <button
            type="button"
            onClick={onClose}
            className="flex min-h-9 items-center gap-1.5 rounded-full bg-white px-4 text-[14px] font-semibold text-[#0b0810]"
          >
            <Check size={15} aria-hidden />
            Готово
          </button>
        </div>
      </header>

      <div ref={boxRef} className="relative min-h-0 flex-1">
        <canvas
          ref={canvasRef}
          // touch-none обязателен: без него Safari прокручивает страницу
          // вместо того, чтобы рисовать.
          className="absolute inset-0 size-full touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </div>

      {panel !== "none" && (
        <div className="shrink-0 px-3 pb-2">
          <div className="rounded-[26px] border border-white/10 bg-white/[0.07] p-3 backdrop-blur-xl">
            {panel === "colors" && (
              <>
                <div className="grid grid-cols-10 gap-1.5">
                  {COLORS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-label={`Цвет ${value}`}
                      onClick={() => setColor(value)}
                      className={cn(
                        "aspect-square rounded-lg border",
                        color === value
                          ? "border-white ring-2 ring-white/40"
                          : "border-white/15",
                      )}
                      style={{ backgroundColor: value }}
                    />
                  ))}
                </div>

                {/* Системная палитра — здесь и есть «все цвета». */}
                <label className="mt-3 flex min-h-11 items-center justify-between gap-3 rounded-2xl bg-white/8 px-3 text-[14px] text-white/85">
                  Свой оттенок
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="size-8 cursor-pointer rounded-lg border-0 bg-transparent p-0"
                    aria-label="Выбрать любой цвет"
                  />
                </label>
              </>
            )}

            {panel === "sizes" && (
              <div className="flex items-center justify-between gap-2">
                {SIZES.map((size) => (
                  <button
                    key={size}
                    type="button"
                    aria-label={`Толщина ${size}`}
                    onClick={() => setWidth(size)}
                    className={cn(
                      "flex h-12 flex-1 items-center justify-center rounded-2xl border",
                      width === size
                        ? "border-white bg-white/15"
                        : "border-white/12",
                    )}
                  >
                    <span
                      className="rounded-full bg-white"
                      style={{
                        // Толщина показывается такой, какой ляжет на лист.
                        width: Math.max(3, size * ui.unit),
                        height: Math.max(3, size * ui.unit),
                      }}
                    />
                  </button>
                ))}
              </div>
            )}

            {panel === "stamps" && (
              <div className="grid grid-cols-10 gap-1.5">
                {GLYPHS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-label={`Штамп ${value}`}
                    onClick={() => {
                      setGlyph(value);
                      setMode("stamp");
                    }}
                    className={cn(
                      "flex aspect-square items-center justify-center rounded-lg border text-[19px]",
                      glyph === value && mode === "stamp"
                        ? "border-white bg-white/15"
                        : "border-white/12",
                    )}
                  >
                    {value}
                  </button>
                ))}
              </div>
            )}

            {panel === "paper" && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {(["portrait", "landscape"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() =>
                        applyPaper({ ...paper, orientation: value })
                      }
                      className={cn(
                        "flex min-h-11 items-center justify-center gap-2 rounded-2xl border text-[14px]",
                        paper.orientation === value
                          ? "border-white bg-white/15 text-white"
                          : "border-white/12 text-white/70",
                      )}
                    >
                      <span
                        className="rounded-[3px] border border-current"
                        style={
                          value === "portrait"
                            ? { width: 11, height: 16 }
                            : { width: 16, height: 11 }
                        }
                      />
                      {value === "portrait" ? "Книжный" : "Альбомный"}
                    </button>
                  ))}
                </div>

                <div className="mt-2 grid grid-cols-4 gap-2">
                  {PAPERS.map((sheet) => (
                    <button
                      key={sheet.kind}
                      type="button"
                      onClick={() => applyPaper({ ...paper, kind: sheet.kind })}
                      className={cn(
                        "rounded-2xl border p-1.5 text-[11px]",
                        paper.kind === sheet.kind
                          ? "border-white bg-white/12 text-white"
                          : "border-white/12 text-white/65",
                      )}
                    >
                      <span
                        className="mb-1 block h-9 w-full rounded-lg border border-black/10"
                        style={{ backgroundColor: sheet.swatch }}
                      />
                      {sheet.title}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Кисти */}
      <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto px-3 pb-1.5">
        {BRUSHES.map((brush) => (
          <Tool
            key={brush.id}
            onClick={() => {
              setMode(brush.id);
              setPanel("none");
            }}
            active={mode === brush.id}
            label={brush.title}
          >
            <brush.icon
              size={18}
              // У маркера тот же значок, что у ручки, — отличаем толщиной.
              strokeWidth={brush.id === "marker" ? 3.2 : 2}
              aria-hidden
            />
          </Tool>
        ))}

        <Tool
          onClick={() => {
            setMode("stamp");
            setPanel(panel === "stamps" ? "none" : "stamps");
          }}
          active={mode === "stamp"}
          label="Штампы"
        >
          <Sparkles size={18} aria-hidden />
        </Tool>

        <Tool
          onClick={() => {
            setMode("text");
            setPanel("none");
          }}
          active={mode === "text"}
          label="Текст"
        >
          <Type size={18} aria-hidden />
        </Tool>

        <Tool
          onClick={() => {
            setMode("eraser");
            setPanel("none");
          }}
          active={mode === "eraser"}
          label="Ластик"
        >
          <Eraser size={18} aria-hidden />
        </Tool>
      </div>

      {/* Нижний ряд: правка и вид следа */}
      <div className="flex shrink-0 items-center gap-2 px-3 pt-1 pb-[max(0.7rem,env(safe-area-inset-bottom))]">
        <Tool onClick={undo} disabled={!ui.canUndo} label="Отменить">
          <Undo2 size={18} aria-hidden />
        </Tool>
        <Tool onClick={redo} disabled={!ui.canRedo} label="Вернуть">
          <Redo2 size={18} aria-hidden />
        </Tool>
        <Tool onClick={clear} disabled={!ui.hasItems} label="Очистить">
          <Trash2 size={18} aria-hidden />
        </Tool>

        <button
          type="button"
          aria-label="Толщина"
          onClick={() => setPanel(panel === "sizes" ? "none" : "sizes")}
          className={cn(
            "ml-auto flex size-11 shrink-0 items-center justify-center rounded-2xl border",
            panel === "sizes" ? "border-white bg-white/12" : "border-white/12",
          )}
        >
          <span
            className="rounded-full bg-white"
            style={{ width: Math.min(20, width), height: Math.min(20, width) }}
          />
        </button>

        <button
          type="button"
          aria-label="Цвет"
          onClick={() => setPanel(panel === "colors" ? "none" : "colors")}
          className={cn(
            "size-11 shrink-0 rounded-2xl border-2",
            panel === "colors" ? "border-white" : "border-white/25",
          )}
          style={{ backgroundColor: brushing ? color : "transparent" }}
        >
          {!brushing && <Sparkles size={17} className="mx-auto text-white/70" />}
        </button>
      </div>

      {/* Ввод текста: он появляется поверх, а не прямо на листе — на
          телефоне под клавиатурой холста всё равно не видно. */}
      {typing && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 px-6">
          <div className="w-full max-w-sm rounded-3xl border border-white/12 bg-[#141020] p-4">
            <p className="text-[13px] text-white/70">Что написать</p>

            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={60}
              onKeyDown={(e) => {
                if (e.key === "Enter") addText();
              }}
              placeholder="Люблю тебя"
              className="mt-2 w-full rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-base text-white outline-none placeholder:text-white/30 focus:border-white/40"
            />

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={addText}
                className="min-h-11 flex-1 rounded-2xl bg-white text-[15px] font-semibold text-[#0b0810]"
              >
                Поставить
              </button>
              <button
                type="button"
                onClick={() => setTyping(null)}
                className="min-h-11 rounded-2xl border border-white/15 px-4 text-[15px] text-white/70"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Tool({
  children,
  onClick,
  disabled,
  active,
  label,
  small,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  label: string;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-2xl transition-colors",
        small ? "size-9" : "size-11",
        disabled
          ? "text-white/20"
          : active
            ? "bg-white text-[#0b0810]"
            : "bg-white/8 text-white/75",
      )}
    >
      {children}
    </button>
  );
}
