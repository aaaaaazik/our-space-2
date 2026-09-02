"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";

import { AnswerNote } from "@/components/games/AnswerNote";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Field";
import { answerWithText, type FormState } from "@/app/(app)/games/actions";
import type { Answer } from "@/types/database";

export function DailyAnswer({
  questionId,
  mine,
  theirs,
  partnerName,
  myName,
}: {
  questionId: string;
  mine: Answer | null;
  theirs: Answer | null;
  partnerName: string;
  /** Своим именем подписывается заметка, которую оставили вы. */
  myName: string;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<FormState, FormData>(
    async (prev, formData) => {
      const result = await answerWithText(prev, formData);
      if (result.ok) router.refresh();
      return result;
    },
    {},
  );

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-3">
        <input type="hidden" name="question_id" value={questionId} />

        <Textarea
          name="body"
          defaultValue={mine?.body ?? ""}
          required
          maxLength={2000}
          placeholder="Жоним, здесь можно не подбирать слова…"
          className="min-h-36 bg-surface/92"
        />

        {state.error && (
          <p role="status" className="text-[14px] text-danger">
            {state.error}
          </p>
        )}

        <Button type="submit" size="lg" block disabled={pending}>
          {pending ? "Сохраняем…" : mine ? "Изменить ответ" : "Ответить"}
        </Button>

        {/* Что о твоём ответе сказали. Своё замечание не переписать. */}
        {mine && (
          <AnswerNote
            answerId={mine.id}
            note={mine.note}
            authorName={partnerName}
            canWrite={false}
          />
        )}
      </form>

      <PartnerAnswer
        mine={mine}
        theirs={theirs}
        partnerName={partnerName}
        myName={myName}
      />
    </div>
  );
}

function PartnerAnswer({
  mine,
  theirs,
  partnerName,
  myName,
}: {
  mine: Answer | null;
  theirs: Answer | null;
  partnerName: string;
  myName: string;
}) {
  // Пока не ответишь сам, база чужой ответ вообще не отдаёт.
  // Поэтому здесь не «скрываем», а честно не знаем, есть он или нет.
  if (!mine) {
    return (
      <div className="flex items-start gap-3 rounded-3xl border border-border bg-surface/82 p-4">
        <Lock size={17} className="mt-0.5 shrink-0 text-text-faint" aria-hidden />
        <p className="text-[14px] leading-relaxed text-text-muted">
          Ответ, который написала {partnerName}, откроется, когда ответишь сама.
          Так честнее — и интереснее.
        </p>
      </div>
    );
  }

  if (!theirs?.body) {
    return (
      <div className="rounded-3xl border border-border bg-surface/82 p-4 text-[14px] text-text-muted">
        Ответа от {partnerName} пока нет. Придёт — увидишь здесь.
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-accent/30 bg-accent-soft/40 p-4">
      <p className="text-[12px] tracking-wide text-text-muted uppercase">
        {partnerName}
      </p>
      <p className="mt-2 text-[15px] leading-relaxed whitespace-pre-wrap text-text">
        {theirs.body}
      </p>

      <AnswerNote
        answerId={theirs.id}
        note={theirs.note}
        authorName={myName}
        canWrite
      />
    </div>
  );
}
