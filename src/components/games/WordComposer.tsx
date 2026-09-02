"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { FieldGroup, Input } from "@/components/ui/Field";
import { createWordRound, type FormState } from "@/app/(app)/games/words/actions";
import { cn } from "@/lib/utils/cn";
import type { WordKind } from "@/types/database";

export function WordComposer() {
  const router = useRouter();
  const [kind, setKind] = useState<WordKind>("rebus");
  const [clue, setClue] = useState("");

  const [state, action, pending] = useActionState<FormState, FormData>(
    async (prev, formData) => {
      const result = await createWordRound(prev, formData);
      if (result.ok) {
        setClue("");
        router.push("/games/words");
        router.refresh();
      }
      return result;
    },
    {},
  );

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="clue" value={clue} />

      <div className="flex gap-1.5">
        <ModeButton active={kind === "rebus"} onClick={() => setKind("rebus")}>
          🧩 Ребус
        </ModeButton>
        <ModeButton
          active={kind === "anagram"}
          onClick={() => setKind("anagram")}
        >
          🔤 Анаграмма
        </ModeButton>
      </div>

      <p className="text-[13px] leading-relaxed text-text-muted">
        {kind === "rebus"
          ? "Загадайте слово и выложите его эмодзи со своей клавиатуры. Например 🌊🏠 — для «дачи»."
          : "Загадайте слово — приложение перемешает буквы, и второй попробует собрать его обратно."}
      </p>

      <FieldGroup
        label="Загаданное слово"
        htmlFor="word"
        hint="Второй его не увидит, пока не угадает или не потратит три попытки."
      >
        <Input
          id="word"
          name="word"
          required
          minLength={2}
          maxLength={40}
          autoComplete="off"
          placeholder={kind === "rebus" ? "Море" : "Подушка"}
        />
      </FieldGroup>

      {kind === "rebus" && (
        <div>
          <p className="mb-1.5 text-[13px] font-medium text-text-muted">
            Подсказка эмодзи
          </p>

          <Input
            value={clue}
            onChange={(e) => setClue(e.target.value)}
            maxLength={200}
            autoComplete="off"
            aria-label="Подсказка эмодзи"
            placeholder="Жоним, тут только эмодзи"
            // Крупнее обычного поля: эмодзи в размере текста не разглядеть
            className="text-2xl leading-relaxed"
          />
        </div>
      )}

      {state.error && (
        <p role="status" className="text-[15px] text-danger">
          {state.error}
        </p>
      )}

      <Button type="submit" size="lg" block disabled={pending}>
        {pending ? "Отправляем…" : "Загадать"}
      </Button>
    </form>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "min-h-10 flex-1 rounded-full px-3 text-[14px] font-medium transition-colors",
        active
          ? "bg-accent text-on-accent"
          : "border border-border bg-surface text-text-muted",
      )}
    >
      {children}
    </button>
  );
}
