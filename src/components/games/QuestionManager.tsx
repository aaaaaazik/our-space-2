"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import {
  addQuestion,
  deleteQuestion,
  type FormState,
} from "@/app/(app)/games/actions";
import type { Question } from "@/types/database";

/**
 * Свои вопросы в набор.
 * Встроенные показываем только числом: их десятки, и трогать их нельзя —
 * у них нет автора, поэтому политика доступа их не отдаст на удаление.
 */
export function QuestionManager({
  packId,
  questions,
  currentUserId,
}: {
  packId: string;
  questions: Question[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const [state, action, pending] = useActionState<FormState, FormData>(
    async (prev, formData) => {
      const result = await addQuestion(prev, formData);
      if (result.ok) {
        formRef.current?.reset();
        router.refresh();
      }
      return result;
    },
    {},
  );

  const mine = questions.filter((q) => q.created_by === currentUserId);
  const builtin = questions.length - questions.filter((q) => q.created_by).length;

  // Набор остался один — вопрос дня, поэтому и подсказка одна.
  const hint = "Например: «Что тебя во мне больше всего успокаивает?»";
  const placeholder = "Что тебя во мне больше всего успокаивает?";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-6 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-border bg-surface/82 py-3 text-[14px] text-text-muted active:bg-surface-2"
      >
        <Plus size={16} aria-hidden />
        Свои вопросы
        {mine.length > 0 && (
          <span className="text-text-faint">· {mine.length}</span>
        )}
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Свои вопросы">
        <form ref={formRef} action={action} className="space-y-3 pt-1">
          <input type="hidden" name="pack_id" value={packId} />

          <Textarea
            name="body"
            required
            minLength={3}
            maxLength={500}
            className="min-h-24"
            placeholder={placeholder}
          />

          <p className="text-[13px] text-text-faint">{hint}</p>

          {state.error && (
            <p role="status" className="text-[14px] text-danger">
              {state.error}
            </p>
          )}

          <Button type="submit" block disabled={pending}>
            {pending ? "Добавляем…" : "Добавить"}
          </Button>
        </form>

        <div className="mt-6 pb-4">
          <p className="text-[12px] tracking-wide text-text-faint uppercase">
            Добавлено вами
          </p>

          {mine.length === 0 ? (
            <p className="mt-2 text-[14px] text-text-muted">
              Пока ничего. Встроенных вопросов — {builtin}.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {mine.map((question) => (
                <li
                  key={question.id}
                  className="flex items-start gap-2 rounded-2xl border border-border bg-surface px-3 py-2.5"
                >
                  <p className="min-w-0 flex-1 text-[14px] leading-snug break-words text-text">
                    {question.body}
                  </p>

                  <form
                    action={async (formData) => {
                      await deleteQuestion(formData);
                      router.refresh();
                    }}
                  >
                    <input type="hidden" name="id" value={question.id} />
                    <button
                      type="submit"
                      aria-label="Удалить вопрос"
                      className="flex size-9 items-center justify-center text-text-faint"
                    >
                      <Trash2 size={15} aria-hidden />
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Sheet>
    </>
  );
}
