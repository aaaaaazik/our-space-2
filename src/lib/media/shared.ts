import type { Photo, PhotoComment } from "@/types/database";

/**
 * Общее для браузера и сервера. Здесь намеренно нет ничего, что
 * обращается к хранилищу: ключи от R2 не должны попасть в браузер,
 * а любой импорт из этого файла тянет за собой всю цепочку зависимостей.
 */

/** Больше этого файл не примем — см. README про лимиты хранилища. */
export const MAX_UPLOAD_BYTES = 45 * 1024 * 1024;

export type MediaItem = Photo & {
  /** Временная ссылка на сам файл. */
  url: string | null;
  /** Для видео — ссылка на кадр-обложку. */
  posterUrl: string | null;
  likedByMe: boolean;
  likeCount: number;
  comments: PhotoComment[];
};

/** «1:23» — длительность видео для значка в сетке. */
export function formatDuration(seconds: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}
