import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/layout/PageHeader";
import { AlbumComposer } from "@/components/photos/AlbumComposer";
import { PhotoGrid } from "@/components/photos/PhotoGrid";
import { PhotoUploader } from "@/components/photos/PhotoUploader";
import { EmptyState } from "@/components/ui/Card";
import { asProfiles, profilesQuery, requireSession } from "@/lib/data/couple";
import { loadMedia, type AlbumWithCount } from "@/lib/data/media";
import { withUnit, units } from "@/lib/utils/plural";

export const metadata: Metadata = { title: "Воспоминания" };

export default async function MemoriesPage(props: PageProps<"/memories">) {
  const { supabase, user } = await requireSession();
  const params = await props.searchParams;
  const tab = params.tab === "albums" ? "albums" : "all";

  const [profilesResult, media] = await Promise.all([
    profilesQuery(supabase),
    loadMedia(supabase, user.id),
  ]);

  const profiles = asProfiles(profilesResult);
  const photos = media.items.filter((i) => i.kind === "photo").length;
  const videos = media.items.filter((i) => i.kind === "video").length;

  const subtitle =
    media.items.length > 0
      ? [
          photos > 0 ? withUnit(photos, units.photo) : null,
          videos > 0 ? withUnit(videos, units.video) : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : undefined;

  return (
    <div>
      <PageHeader
        title="Воспоминания"
        subtitle={subtitle}
        action={<PhotoUploader />}
      />

      <div className="flex items-center gap-2 px-5 pb-4">
        <Tab href="/memories" active={tab === "all"}>
          Все
        </Tab>
        <Tab href="/memories?tab=albums" active={tab === "albums"}>
          Альбомы
        </Tab>
        <div className="ml-auto">
          <AlbumComposer />
        </div>
      </div>

      {tab === "albums" ? (
        <AlbumList albums={media.albums} />
      ) : (
        <PhotoGrid
          items={media.items}
          profiles={profiles}
          albums={media.albums}
          currentUserId={user.id}
        />
      )}
    </div>
  );
}

function Tab({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      prefetch
      aria-current={active ? "page" : undefined}
      className={
        "flex min-h-9 items-center rounded-full px-3.5 text-[14px] font-medium transition-colors " +
        (active
          ? "bg-accent text-on-accent"
          : "border border-border text-text-muted")
      }
    >
      {children}
    </Link>
  );
}

function AlbumList({ albums }: { albums: AlbumWithCount[] }) {
  if (albums.length === 0) {
    return (
      <EmptyState
        emoji="🗂"
        title="Альбомов пока нет"
        description="Создайте первый — например «Наши поездки» или «Море». Потом сможете раскладывать по ним фотографии."
      />
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-3 px-5">
      {albums.map((album) => (
        <li key={album.id}>
          <Link
            href={`/memories/${album.id}`}
            prefetch
            className="block overflow-hidden rounded-3xl border border-border bg-surface shadow-card active:bg-surface-2"
          >
            <div className="aspect-4/3 bg-surface-2">
              {album.coverUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={album.coverUrl}
                  alt=""
                  loading="lazy"
                  className="size-full object-cover"
                />
              )}
            </div>
            <div className="px-3 py-2.5">
              <p className="truncate text-[15px] font-medium text-text">
                {album.emoji ? `${album.emoji} ` : ""}
                {album.title}
              </p>
              <p className="mt-0.5 text-[13px] text-text-faint">
                {album.count > 0 ? `${album.count}` : "пусто"}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
