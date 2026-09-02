"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderPlus } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { FieldGroup, Input, Textarea } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { createAlbum, type FormState } from "@/app/(app)/memories/actions";

const EMOJI = ["❤️", "✈️", "🏠", "🎂", "😂", "📸", "💍", "🌊", "🍽", "⭐"];

export function AlbumComposer() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [emoji, setEmoji] = useState("");
  const [state, action, pending] = useActionState<FormState, FormData>(
    async (prev, formData) => {
      const result = await createAlbum(prev, formData);
      if (result.ok) {
        setOpen(false);
        setEmoji("");
        router.refresh();
      }
      return result;
    },
    {},
  );

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => setOpen(true)}
        aria-label="Создать альбом"
      >
        <FolderPlus size={17} aria-hidden />
        Альбом
      </Button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Новый альбом">
        <form action={action} id="album-form" className="space-y-4 pt-1 pb-4">
          <FieldGroup label="Название" htmlFor="album-title">
            <Input
              id="album-title"
              name="title"
              required
              maxLength={60}
              placeholder="Наши поездки"
            />
          </FieldGroup>

          <div>
            <p className="mb-1.5 text-[13px] font-medium text-text-muted">
              Значок
            </p>
            <input type="hidden" name="emoji" value={emoji} />
            <div className="flex flex-wrap gap-2">
              {EMOJI.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEmoji(emoji === e ? "" : e)}
                  aria-pressed={emoji === e}
                  className={
                    "flex size-11 items-center justify-center rounded-2xl border text-xl transition-colors " +
                    (emoji === e
                      ? "border-accent bg-accent-soft"
                      : "border-border bg-surface")
                  }
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          <FieldGroup label="Описание" htmlFor="album-description">
            <Textarea
              id="album-description"
              name="description"
              className="min-h-20"
              placeholder="Необязательно"
            />
          </FieldGroup>

          {state.error && (
            <p role="status" className="text-[15px] text-danger">
              {state.error}
            </p>
          )}
        </form>

        <div className="pb-2">
          <Button
            type="submit"
            form="album-form"
            size="lg"
            block
            disabled={pending}
          >
            {pending ? "Создаём…" : "Создать"}
          </Button>
        </div>
      </Sheet>
    </>
  );
}
