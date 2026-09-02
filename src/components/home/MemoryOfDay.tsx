import Link from "next/link";
import { Play } from "lucide-react";

import type { DayMemory } from "@/lib/data/memoryOfDay";
import { plural, units } from "@/lib/utils/plural";

/**
 * Снимок, сделанный в этот же день год или несколько лет назад.
 *
 * Стоит сразу под счётчиком: это самое сильное, что приложение может
 * показать при открытии, и ради этого стоит хранить фотографии в одном
 * месте, а не в общей ленте телефона.
 */
export function MemoryOfDay({ memory }: { memory: DayMemory }) {
  return (
    <Link
      href={memory.albumId ? `/memories/${memory.albumId}` : "/memories"}
      prefetch
      className="mt-6 block overflow-hidden rounded-3xl border border-border shadow-card transition-transform duration-150 active:scale-[0.99]"
    >
      <div className="relative">
        {/*
          Квадрат намеренно. Снимки бывают и вертикальные, и горизонтальные,
          а горизонтальная рамка режет вертикальный кадр по самому больному —
          срезает головы. Квадрат обходится с обоими одинаково мягко.
        */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={memory.url}
          alt={memory.title ?? "Воспоминание этого дня"}
          className="block aspect-square w-full object-cover"
        />

        {memory.kind === "video" && (
          <span className="absolute top-3 right-3 flex size-8 items-center justify-center rounded-full bg-black/45 text-white">
            <Play size={14} fill="currentColor" aria-hidden />
          </span>
        )}

        {/*
          Затемнение снизу, чтобы подпись читалась на любом снимке.
          Это не полупрозрачная плашка, а градиент: на тёмной фотографии
          плашка была бы заметной заплаткой, а градиент — нет.
        */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-4 pt-10 pb-3.5">
          <p className="text-[12px] tracking-[0.16em] text-white/75 uppercase">
            {agoLabel(memory.yearsAgo, memory.exact)}
          </p>

          <p className="mt-1 text-[15px] leading-snug font-medium text-white">
            {memory.title ?? memory.when}
          </p>

          {memory.title && (
            <p className="mt-0.5 text-[12px] text-white/70">{memory.when}</p>
          )}
        </div>
      </div>
    </Link>
  );
}

/** «Год назад в этот день», «5 лет назад в эти дни». */
function agoLabel(yearsAgo: number, exact: boolean): string {
  const when = exact ? "в этот день" : "в эти дни";

  // «1 год назад» звучит канцелярски, а «год назад» — как говорят.
  if (yearsAgo === 1) return `Год назад ${when}`;

  return `${yearsAgo} ${plural(yearsAgo, units.year)} назад ${when}`;
}
