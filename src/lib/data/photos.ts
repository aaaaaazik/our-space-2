import "server-only";

import { createViewUrls } from "@/lib/storage/r2";
import type { MediaItem } from "@/lib/media/shared";
import type { Photo, PhotoComment, PhotoReaction } from "@/types/database";

/**
 * Собирает то, что показывает галерея: файл, обложку, отметки ❤️
 * и комментарии — в одном объекте на каждую запись.
 *
 * Файлы в R2 лежат приватно, прямых ссылок на них нет. Для показа
 * выписываем временные подписанные ссылки сразу на всю пачку.
 */
export async function toMediaItems(
  photos: Photo[],
  reactions: PhotoReaction[],
  comments: PhotoComment[],
  currentUserId: string,
): Promise<MediaItem[]> {
  if (photos.length === 0) return [];

  const keys = photos.flatMap((photo) =>
    photo.poster_path
      ? [photo.storage_path, photo.poster_path]
      : [photo.storage_path],
  );
  const urls = await createViewUrls(keys);

  return photos.map((photo) => {
    const likes = reactions.filter((r) => r.photo_id === photo.id);

    return {
      ...photo,
      url: urls.get(photo.storage_path) ?? null,
      posterUrl: photo.poster_path
        ? (urls.get(photo.poster_path) ?? null)
        : null,
      likedByMe: likes.some((r) => r.user_id === currentUserId),
      likeCount: likes.length,
      comments: comments
        .filter((c) => c.photo_id === photo.id)
        .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    };
  });
}
