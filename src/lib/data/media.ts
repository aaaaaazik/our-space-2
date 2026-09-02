import type { SupabaseClient } from "@supabase/supabase-js";

import { toMediaItems } from "@/lib/data/photos";
import type { MediaItem } from "@/lib/media/shared";
import type {
  Album,
  Database,
  Photo,
  PhotoComment,
  PhotoReaction,
} from "@/types/database";

type Client = SupabaseClient<Database>;

export type AlbumWithCount = Album & { count: number; coverUrl: string | null };

/**
 * Всё, что нужно разделу «Воспоминания», одним заходом.
 * Запросы уходят вместе: задержка до базы платится один раз, а не пять.
 */
export async function loadMedia(
  supabase: Client,
  currentUserId: string,
  options: { albumId?: string } = {},
): Promise<{ items: MediaItem[]; albums: AlbumWithCount[] }> {
  let photosQuery = supabase
    .from("photos")
    .select("*")
    .order("taken_at", { ascending: false });

  if (options.albumId) photosQuery = photosQuery.eq("album_id", options.albumId);

  const [photosResult, reactionsResult, commentsResult, albumsResult] =
    await Promise.all([
      photosQuery,
      supabase.from("photo_reactions").select("*"),
      supabase.from("photo_comments").select("*"),
      supabase.from("albums").select("*").order("created_at"),
    ]);

  const photos = (photosResult.data as Photo[] | null) ?? [];
  const albums = (albumsResult.data as Album[] | null) ?? [];

  const items = await toMediaItems(
    photos,
    (reactionsResult.data as PhotoReaction[] | null) ?? [],
    (commentsResult.data as PhotoComment[] | null) ?? [],
    currentUserId,
  );

  return { items, albums: withCounts(albums, items) };
}

/**
 * Считаем количество и подбираем обложку.
 * Обложка — самый свежий файл альбома, если она не задана вручную;
 * так альбом никогда не выглядит пустым.
 */
function withCounts(albums: Album[], items: MediaItem[]): AlbumWithCount[] {
  return albums.map((album) => {
    const inAlbum = items.filter((item) => item.album_id === album.id);

    const chosen =
      inAlbum.find((item) => item.id === album.cover_photo_id) ?? inAlbum[0];

    return {
      ...album,
      count: inAlbum.length,
      coverUrl: chosen
        ? (chosen.kind === "video" ? chosen.posterUrl : chosen.url)
        : null,
    };
  });
}
