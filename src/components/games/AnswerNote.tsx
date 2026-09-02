"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";

import { setAnswerNote, type FormState } from "@/app/(app)/games/actions";

/**
 * Тихая строчка к ответу второго.
 *
 * Намеренно не выглядит полем ввода: пока не нажмёшь, это просто бледная
 * подпись под ответом. Смысл — отозваться парой слов, а не завести переписку;
 * для длинного разговора есть дневник.
 */
export function AnswerNote({
  answerId,
  note,
  authorName,
  canWrite,
}: {
  answerId: string;
  note: string | null;
  /** Чьё это замечание — подписываем, чтобы не гадать. */
  authorName: string | null;
  /** К своему ответу заметку не оставить. */
  canWrite: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);

  const [state, action, pending] = useActionState<FormState, FormData>(
    async (prev, formData) => {
      const result = await setAnswerNote(prev, formData);
      if (result.ok) {
        setEditing(false);
        router.refresh();
      }
      return result;
    },
    {},
  );

  if (!canWrite && !note) return null;

  if (editing) {
    return (
      <form action={action} className="mt-3">
        <input type="hidden" name="id" value={answerId} />
        <input
          name="note"
          defaultValue={note ?? ""}
          maxLength={200}
          autoFocus
          autoComplete="off"
          placeholder="пара слов…"
          className="w-full border-b border-border bg-transparent pb-1 text-[13px] text-text outline-none placeholder:text-text-faint focus:border-accent"
        />

        <div className="mt-1.5 flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="text-[12px] text-accent"
          >
            {pending ? "…" : "Сохранить"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-[12px] text-text-faint"
          >
            Отмена
          </button>
          {state.error && (
            <span className="text-[12px] text-danger">{state.error}</span>
          )}
        </div>
      </form>
    );
  }

  if (note) {
    return (
      <button
        type="button"
        onClick={() => canWrite && setEditing(true)}
        className="mt-3 block text-left text-[12px] leading-snug text-text-faint italic"
      >
        {note}
        {authorName && <span className="not-italic"> — {authorName}</span>}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="mt-3 block text-[12px] text-text-faint/70"
    >
      + пара слов
    </button>
  );
}
