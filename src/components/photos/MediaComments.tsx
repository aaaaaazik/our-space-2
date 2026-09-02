"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import {
  addComment,
  deleteComment,
  type FormState,
} from "@/app/(app)/memories/actions";
import type { MediaItem } from "@/lib/media/shared";
import type { Profile } from "@/types/database";

export function MediaComments({
  open,
  onClose,
  item,
  profiles,
  currentUserId,
}: {
  open: boolean;
  onClose: () => void;
  item: MediaItem;
  profiles: Profile[];
  currentUserId: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<FormState, FormData>(
    addComment,
    {},
  );

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state.ok, router]);

  const nameOf = (id: string) =>
    profiles.find((p) => p.id === id)?.display_name ?? "—";

  return (
    <Sheet open={open} onClose={onClose} title="Комментарии">
      <div className="space-y-4 pt-1 pb-4">
        {item.comments.length === 0 ? (
          <p className="py-6 text-center text-[15px] text-text-muted">
            Пока ни одного. Напишите первым.
          </p>
        ) : (
          <ul className="space-y-3">
            {item.comments.map((comment) => (
              <li key={comment.id} className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-text-faint">
                    {nameOf(comment.author_id)}
                    {" · "}
                    {new Date(comment.created_at).toLocaleDateString("ru-RU", {
                      day: "numeric",
                      month: "short",
                    })}
                  </p>
                  <p className="mt-0.5 text-[15px] leading-relaxed break-words text-text">
                    {comment.body}
                  </p>
                </div>

                {comment.author_id === currentUserId && (
                  <form
                    action={async (formData) => {
                      await deleteComment(formData);
                      router.refresh();
                    }}
                  >
                    <input type="hidden" name="id" value={comment.id} />
                    <button
                      type="submit"
                      aria-label="Удалить комментарий"
                      className="flex size-9 items-center justify-center text-text-faint"
                    >
                      <Trash2 size={15} aria-hidden />
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}

        <form ref={formRef} action={action} className="flex gap-2 pt-1">
          <input type="hidden" name="photo_id" value={item.id} />
          <Input
            name="body"
            required
            maxLength={2000}
            placeholder="Написать…"
            autoComplete="off"
          />
          <Button type="submit" disabled={pending}>
            {pending ? "…" : "→"}
          </Button>
        </form>

        {state.error && (
          <p role="status" className="text-[14px] text-danger">
            {state.error}
          </p>
        )}
      </div>
    </Sheet>
  );
}
