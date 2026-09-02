"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { FieldGroup, Input, Textarea } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import {
  deletePhoto,
  updatePhoto,
  type FormState,
} from "@/app/(app)/memories/actions";
import type { MediaItem } from "@/lib/media/shared";
import type { Album } from "@/types/database";

/** Подпись, дата, альбом. Доступно только автору загрузки. */
export function MediaEditor({
  open,
  onClose,
  item,
  albums,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  item: MediaItem;
  albums: Album[];
  onDeleted: () => void;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<FormState, FormData>(
    updatePhoto,
    {},
  );

  useEffect(() => {
    if (state.ok) {
      onClose();
      router.refresh();
    }
  }, [state.ok, onClose, router]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={item.kind === "video" ? "О видео" : "О фотографии"}
    >
      <form action={action} id="media-form" className="space-y-4 pt-1 pb-4">
        <input type="hidden" name="id" value={item.id} />

        <FieldGroup label="Название" htmlFor="media-title">
          <Input
            id="media-title"
            name="title"
            defaultValue={item.title ?? ""}
            maxLength={140}
            placeholder="Наш первый день на море"
          />
        </FieldGroup>

        <FieldGroup label="Описание" htmlFor="media-description">
          <Textarea
            id="media-description"
            name="description"
            className="min-h-24"
            defaultValue={item.description ?? ""}
            placeholder="Это был один из самых счастливых дней."
          />
        </FieldGroup>

        <FieldGroup label="Дата" htmlFor="media-date">
          <Input
            id="media-date"
            name="taken_at"
            type="date"
            defaultValue={item.taken_at.slice(0, 10)}
          />
        </FieldGroup>

        <FieldGroup label="Альбом" htmlFor="media-album">
          <select
            id="media-album"
            name="album_id"
            defaultValue={item.album_id ?? ""}
            className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-base text-text outline-none focus:border-accent"
          >
            <option value="">Без альбома</option>
            {albums.map((album) => (
              <option key={album.id} value={album.id}>
                {album.emoji ? `${album.emoji} ` : ""}
                {album.title}
              </option>
            ))}
          </select>
        </FieldGroup>

        {state.error && (
          <p role="status" className="text-[15px] text-danger">
            {state.error}
          </p>
        )}
      </form>

      <div className="space-y-2 pb-2">
        <Button type="submit" form="media-form" size="lg" block disabled={pending}>
          {pending ? "Сохраняем…" : "Сохранить"}
        </Button>

        <form
          action={async (formData) => {
            await deletePhoto(formData);
            onDeleted();
            router.refresh();
          }}
          onSubmit={(e) => {
            if (!confirm("Удалить безвозвратно?")) e.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={item.id} />
          <Button type="submit" variant="danger" block>
            Удалить
          </Button>
        </form>
      </div>
    </Sheet>
  );
}
