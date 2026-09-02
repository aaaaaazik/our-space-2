"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize2, Pencil } from "lucide-react";

import { DrawingEditor } from "@/components/games/DrawingEditor";
import {
  paintItems,
  paintPaper,
  paperSize,
  toBlob,
  type Item,
  type Paper,
} from "@/lib/games/artboard";

/**
 * Рисунок на странице: превью, которое по нажатию открывается на весь экран.
 *
 * Раньше рисовали прямо здесь, в квадрате в треть экрана. Пальцем на таком
 * поле не выходило ничего, кроме крупных каракулей. Теперь тут только показ
 * готового, а вся работа — в полноэкранном редакторе.
 */
export function DrawingCanvas({
  onReady,
}: {
  /** Отдаёт готовый рисунок наружу. Пусто — если ничего не нарисовано. */
  onReady: (getBlob: () => Promise<Blob | null>) => void;
}) {
  const previewRef = useRef<HTMLCanvasElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [paper, setPaper] = useState<Paper>({
    kind: "white",
    orientation: "portrait",
  });
  const [open, setOpen] = useState(false);

  /*
    Зеркало последнего состояния.

    Наружу мы отдаём функцию, и она должна возвращать не то, что было при
    её создании, а то, что нарисовано сейчас. Обычная переменная состояния
    осталась бы в ней замороженной, поэтому рядом живёт ref — читаем его
    уже в момент вызова, а не при отрисовке.
  */
  const latest = useRef({ items, paper });

  useEffect(() => {
    latest.current = { items, paper };
  }, [items, paper]);

  // Наружу отдаём не то, что на экране, а рисунок в размере листа: так
  // качество не зависит от того, с какого устройства рисовали.
  useEffect(() => {
    onReady(() => toBlob(latest.current.items, latest.current.paper));
  }, [onReady]);

  useEffect(() => {
    const canvas = previewRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);

    const { w } = paperSize(paper);
    const scale = (rect.width / w) * dpr;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    paintPaper(ctx, paper);
    paintItems(ctx, items, paper);
  }, [items, paper, open]);

  const empty = items.length === 0;
  const { w, h } = paperSize(paper);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        // Пропорции те же, что у листа: иначе превью показывало бы
        // не то, что нарисовано.
        style={{ aspectRatio: `${w} / ${h}` }}
        className="relative block w-full overflow-hidden rounded-3xl border border-border bg-white shadow-card transition-transform duration-150 active:scale-[0.99]"
      >
        <canvas ref={previewRef} className="size-full" />

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
          items={items}
          paper={paper}
          onChange={setItems}
          onPaper={setPaper}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
