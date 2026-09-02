"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize2, Pencil } from "lucide-react";

import { DrawingEditor } from "@/components/games/DrawingEditor";
import {
  ART_H,
  ART_W,
  paintPaper,
  paintStrokes,
  toBlob,
  type Stroke,
} from "@/lib/games/artboard";

/**
 * Рисунок на странице: маленькое превью, которое по нажатию открывается
 * на весь экран.
 *
 * Раньше рисовали прямо здесь, в квадрате в треть экрана. Пальцем на таком
 * поле не выходило ничего, кроме крупных каракулей, а мелкие детали были
 * невозможны вовсе. Теперь тут только показ готового, а вся работа —
 * в полноэкранном редакторе.
 */
export function DrawingCanvas({
  onReady,
}: {
  /** Отдаёт готовый рисунок наружу. Пусто — если ничего не нарисовано. */
  onReady: (getBlob: () => Promise<Blob | null>) => void;
}) {
  const previewRef = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [open, setOpen] = useState(false);

  /*
    Зеркало последнего рисунка.

    Наружу мы отдаём функцию, и она должна возвращать не то, что было при
    её создании, а то, что нарисовано сейчас. Обычная переменная состояния
    осталась бы в ней замороженной, поэтому рядом живёт ref — читаем его
    уже в момент вызова, а не при отрисовке.
  */
  const latest = useRef<Stroke[]>(strokes);

  useEffect(() => {
    latest.current = strokes;
  }, [strokes]);

  // Наружу отдаём не то, что на экране, а рисунок в собственном размере:
  // так качество не зависит от того, с какого устройства рисовали.
  useEffect(() => {
    onReady(() => toBlob(latest.current));
  }, [onReady]);

  // Превью перерисовываем, когда рисунок изменился или закрылся редактор.
  useEffect(() => {
    const canvas = previewRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);

    const scale = (rect.width / ART_W) * dpr;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    paintPaper(ctx);
    paintStrokes(ctx, strokes);
  }, [strokes, open]);

  const empty = strokes.length === 0;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        // Пропорции те же, что у листа: иначе превью показывало бы
        // не то, что нарисовано.
        style={{ aspectRatio: `${ART_W} / ${ART_H}` }}
        className="relative block w-full overflow-hidden rounded-3xl border border-border bg-white transition-transform duration-150 active:scale-[0.99]"
      >
        <canvas ref={previewRef} className="size-full" />

        {/* Подсказка поверх пустого листа — чтобы было понятно, куда нажать. */}
        {empty && (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[#7c6f92]">
            <Pencil size={26} aria-hidden />
            <span className="text-[15px]">Нажмите, чтобы рисовать</span>
            <span className="text-[13px] text-[#a396bb]">
              откроется на весь экран
            </span>
          </span>
        )}

        {!empty && (
          <span className="absolute right-3 bottom-3 flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 text-[12px] text-white">
            <Maximize2 size={12} aria-hidden />
            Изменить
          </span>
        )}
      </button>

      {open && (
        <DrawingEditor
          strokes={strokes}
          onChange={setStrokes}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
