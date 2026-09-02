"use client";

import { useState } from "react";
import { Heart, Play } from "lucide-react";

import { EmptyState } from "@/components/ui/Card";
import { formatDuration, type MediaItem } from "@/lib/media/shared";
import type { Album, Profile } from "@/types/database";

import { Lightbox } from "./Lightbox";

export function PhotoGrid({
  items,
  profiles,
  albums,
  currentUserId,
  emptyHint,
}: {
  items: MediaItem[];
  profiles: Profile[];
  albums: Album[];
  currentUserId: string;
  emptyHint?: string;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (items.length === 0) {
    return (
      <EmptyState
        emoji="📸"
        title="Пока пусто"
        description={
          emptyHint ??
          "Загрузите первые фотографии или видео — они останутся только между вами."
        }
      />
    );
  }

  return (
    <>
      <ul className="grid grid-cols-3 gap-1.5 px-1.5">
        {items.map((item, i) => {
          const preview = item.kind === "video" ? item.posterUrl : item.url;
          const duration = formatDuration(item.duration_seconds);

          return (
            // Покачивания здесь намеренно нет. Каждая качающаяся плитка
            // просит у телефона отдельную картинку в видеокарте, а в сетке
            // их бывает полсотни. Памяти под столько не хватает, и тогда
            // Safari перестаёт считать движение на видеокарте вообще — по
            // всей странице, включая фон. Четыре плитки на главной он
            // тянет спокойно, целую галерею — нет.
            <li key={item.id} className="relative">
              <button
                type="button"
                onClick={() => setOpenIndex(i)}
                className="block aspect-square w-full overflow-hidden rounded-2xl bg-surface-2 transition-transform duration-150 active:scale-[0.97]"
                aria-label={
                  item.title ??
                  (item.kind === "video"
                    ? "Открыть видео"
                    : "Открыть фотографию")
                }
              >
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={preview}
                    alt={item.title ?? ""}
                    loading="lazy"
                    decoding="async"
                    className="size-full object-cover"
                  />
                ) : (
                  item.kind === "video" && (
                    <span className="flex size-full items-center justify-center text-text-faint">
                      <Play size={22} aria-hidden />
                    </span>
                  )
                )}
              </button>

              {/* Значки поверх превью — не перехватывают нажатие.
                  Размытия фона здесь нет намеренно: плитка качается, и под
                  каждым значком браузеру пришлось бы пересчитывать размытие
                  на каждом кадре. Плотный фон выглядит так же. */}
              <div className="pointer-events-none absolute inset-x-1.5 bottom-1.5 flex items-end justify-between gap-1">
                {item.kind === "video" ? (
                  <span className="flex items-center gap-1 rounded-full bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white">
                    <Play size={9} fill="currentColor" aria-hidden />
                    {duration ?? "видео"}
                  </span>
                ) : (
                  <span />
                )}

                {item.likeCount > 0 && (
                  <span className="rounded-full bg-black/70 p-1">
                    <Heart
                      size={11}
                      className="text-white"
                      fill="currentColor"
                      aria-hidden
                    />
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <Lightbox
        items={items}
        albums={albums}
        profiles={profiles}
        currentUserId={currentUserId}
        index={openIndex}
        onIndexChange={setOpenIndex}
        onClose={() => setOpenIndex(null)}
      />
    </>
  );
}
