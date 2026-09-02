import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { PhotoGrid } from "@/components/photos/PhotoGrid";
import { PhotoUploader } from "@/components/photos/PhotoUploader";
import { asProfiles, profilesQuery, requireSession } from "@/lib/data/couple";
import { loadMedia } from "@/lib/data/media";
import type { Album } from "@/types/database";

export default async function AlbumPage(
  props: PageProps<"/memories/[albumId]">,
) {
  const { albumId } = await props.params;
  const { supabase, user } = await requireSession();

  const [profilesResult, albumResult, media] = await Promise.all([
    profilesQuery(supabase),
    supabase.from("albums").select("*").eq("id", albumId).maybeSingle(),
    loadMedia(supabase, user.id, { albumId }),
  ]);

  const album = albumResult.data as Album | null;
  if (!album) notFound();

  return (
    <div>
      <header className="px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-4">
        <Link
          href="/memories?tab=albums"
          prefetch
          className="-ml-1 inline-flex min-h-9 items-center gap-0.5 text-[14px] text-text-muted"
        >
          <ChevronLeft size={17} aria-hidden />
          Альбомы
        </Link>

        <div className="mt-2 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display text-[27px] leading-tight text-text">
              {album.emoji ? `${album.emoji} ` : ""}
              {album.title}
            </h1>
            {album.description && (
              <p className="mt-1 text-[14px] leading-relaxed text-text-muted">
                {album.description}
              </p>
            )}
          </div>

          <div className="shrink-0 pt-1">
            {/* Загруженное здесь сразу попадает в этот альбом */}
            <PhotoUploader albumId={album.id} />
          </div>
        </div>
      </header>

      <PhotoGrid
        items={media.items}
        profiles={asProfiles(profilesResult)}
        albums={media.albums}
        currentUserId={user.id}
        emptyHint="Добавьте сюда первые фотографии или видео — кнопка «Добавить» вверху."
      />
    </div>
  );
}
