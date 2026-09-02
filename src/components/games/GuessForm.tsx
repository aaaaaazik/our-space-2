"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { submitGuess, type FormState } from "@/app/(app)/games/draw/actions";

export function GuessForm({ roundId }: { roundId: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<FormState, FormData>(
    async (prev, formData) => {
      const result = await submitGuess(prev, formData);
      if (result.ok) router.refresh();
      return result;
    },
    {},
  );

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="round_id" value={roundId} />

      <Input
        name="guess"
        required
        maxLength={200}
        autoComplete="off"
        placeholder="Что здесь нарисовано?"
        className="bg-surface/92"
      />

      {state.error && (
        <p role="status" className="text-[14px] text-danger">
          {state.error}
        </p>
      )}

      <Button type="submit" size="lg" block disabled={pending}>
        {pending ? "Отправляем…" : "Ответить"}
      </Button>

      <p className="text-center text-[13px] text-text-faint">
        После ответа задание откроется
      </p>
    </form>
  );
}
