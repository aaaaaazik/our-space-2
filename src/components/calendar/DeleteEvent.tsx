"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

import { deleteEvent } from "@/app/(app)/calendar/actions";

/**
 * Крестик у события. Удаляет в два нажатия, а не в одно: промахнуться
 * пальцем по маленькой кнопке легко, а восстановить удалённое нечем.
 */
export function DeleteEvent({
  id,
  kind,
  title,
}: {
  id: string;
  kind: "plan" | "date";
  title: string;
}) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        aria-label={`Удалить «${title}»`}
        className="-mt-1 -mr-1 flex size-9 shrink-0 items-center justify-center rounded-full text-text-faint active:bg-surface-2"
      >
        <X size={16} aria-hidden />
      </button>
    );
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const formData = new FormData();
          formData.set("id", id);
          formData.set("kind", kind);

          startTransition(async () => {
            await deleteEvent(formData);
            router.refresh();
          });
        }}
        className="text-[12px] text-danger"
      >
        {pending ? "…" : "Удалить"}
      </button>

      <button
        type="button"
        onClick={() => setAsking(false)}
        className="text-[12px] text-text-faint"
      >
        Отмена
      </button>
    </div>
  );
}
