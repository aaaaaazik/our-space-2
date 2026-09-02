"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { tryWord } from "@/app/(app)/games/words/actions";

const MAX_ATTEMPTS = 3;

export function WordGuess({
  roundId,
  attempts,
}: {
  roundId: string;
  attempts: number;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [value, setValue] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const left = MAX_ATTEMPTS - attempts;

  async function submit() {
    if (!value.trim()) return;

    setBusy(true);
    setNote(null);

    const result = await tryWord(roundId, value);

    if (result.error) {
      setNote(result.error);
    } else if (result.correct) {
      setNote(null);
      startTransition(() => router.refresh());
    } else if (result.finished) {
      startTransition(() => router.refresh());
    } else {
      const remaining = MAX_ATTEMPTS - (result.attempts ?? attempts + 1);
      setNote(
        remaining === 1
          ? "Мимо. Осталась одна попытка."
          : `Мимо. Осталось попыток: ${remaining}.`,
      );
      setValue("");
      startTransition(() => router.refresh());
    }

    setBusy(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
          }}
          maxLength={60}
          autoComplete="off"
          placeholder="Что загадано?"
          aria-label="Ответ"
          className="bg-surface/92"
        />
        <Button onClick={submit} disabled={busy}>
          {busy ? "…" : "→"}
        </Button>
      </div>

      <p className="text-center text-[13px] text-text-faint">
        {left > 1 ? `Попыток осталось: ${left}` : "Последняя попытка"}
      </p>

      {note && (
        <p role="status" className="text-center text-[14px] text-danger">
          {note}
        </p>
      )}
    </div>
  );
}
