"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import {
  addStatement,
  answerWho,
  deleteStatement,
  type WhoState,
} from "@/app/(app)/games/who/actions";
import { cn } from "@/lib/utils/cn";
import type { WhoAnswer, WhoStatement } from "@/types/database";

type Row = {
  statement: WhoStatement;
  /** На кого показал я. */
  mine: string | null;
  /** На кого показал второй. Приходит только после моего ответа. */
  theirs: string | null;
};

export function WhoGame({
  statements,
  answers,
  currentUserId,
  myName,
  partnerId,
  partnerName,
}: {
  statements: WhoStatement[];
  answers: WhoAnswer[];
  currentUserId: string;
  myName: string;
  partnerId: string;
  partnerName: string;
}) {
  const rows: Row[] = statements.map((statement) => {
    const forStatement = answers.filter((a) => a.statement_id === statement.id);

    return {
      statement,
      mine:
        forStatement.find((a) => a.author_id === currentUserId)?.pick ?? null,
      theirs:
        forStatement.find((a) => a.author_id !== currentUserId)?.pick ?? null,
    };
  });

  const unanswered = rows.filter((row) => row.mine === null);
  const both = rows.filter((row) => row.mine !== null && row.theirs !== null);
  const waiting = rows.filter((row) => row.mine !== null && row.theirs === null);

  // Совпадение — это просто равенство: ответы хранятся как ссылки на
  // человека, а не как «я» и «ты».
  const matched = both.filter((row) => row.mine === row.theirs).length;

  return (
    <div className="mt-2 pb-4">
      <h1 className="font-display text-[26px] leading-snug text-text">
        Кто из нас?
      </h1>

      {both.length > 0 ? (
        <p className="mt-1.5 text-[14px] text-text-muted">
          Сошлись {matched} из {both.length}
        </p>
      ) : (
        <p className="mt-1.5 text-[14px] leading-relaxed text-text-muted">
          Показывайте на одного из двоих. Ответ второго откроется, только
          когда ответите оба.
        </p>
      )}

      {unanswered.length > 0 ? (
        <Card
          row={unanswered[0]}
          currentUserId={currentUserId}
          partnerId={partnerId}
          partnerName={partnerName}
          left={unanswered.length}
        />
      ) : (
        <p className="mt-8 rounded-3xl border border-border bg-surface/82 p-4 text-center text-[14px] leading-relaxed text-text-muted">
          Утверждения кончились. Допишите своё — они складываются в общий
          набор, и второй увидит их у себя.
        </p>
      )}

      {both.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2.5 text-[12px] tracking-wide text-text-faint uppercase">
            Открытые
          </h2>
          <ul className="space-y-2">
            {both.map((row) => (
              <Result
                key={row.statement.id}
                row={row}
                currentUserId={currentUserId}
                myName={myName}
                partnerName={partnerName}
              />
            ))}
          </ul>
        </section>
      )}

      {waiting.length > 0 && (
        <p className="mt-5 text-center text-[13px] leading-snug text-text-faint">
          Ждём ответа ещё на {waiting.length}: пока {partnerName} не ответит,
          открывать нечего.
        </p>
      )}

      <Composer />
    </div>
  );
}

/**
 * Текущее утверждение: два больших выбора.
 *
 * Показывается по одному, а не списком: игра про первое ощущение, а не
 * про сравнение вариантов между собой.
 */
function Card({
  row,
  currentUserId,
  partnerId,
  partnerName,
  left,
}: {
  row: Row;
  currentUserId: string;
  partnerId: string;
  partnerName: string;
  left: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function pick(who: string) {
    if (pending) return;

    startTransition(async () => {
      const result = await answerWho(row.statement.id, who);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="mt-6">
      <div className="rounded-[28px] border border-accent/25 bg-accent-soft/30 p-6 text-center">
        <p className="font-display text-[22px] leading-snug text-text">
          {row.statement.body}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Button
          size="lg"
          block
          variant="secondary"
          disabled={pending}
          onClick={() => pick(currentUserId)}
        >
          Я
        </Button>
        <Button
          size="lg"
          block
          variant="secondary"
          disabled={pending}
          onClick={() => pick(partnerId)}
        >
          {partnerName}
        </Button>
      </div>

      {error && (
        <p role="status" className="mt-2 text-center text-[14px] text-danger">
          {error}
        </p>
      )}

      <p className="mt-3 text-center text-[12px] text-text-faint">
        Осталось {left}
      </p>
    </div>
  );
}

/** Открытая пара ответов. */
function Result({
  row,
  currentUserId,
  myName,
  partnerName,
}: {
  row: Row;
  currentUserId: string;
  myName: string;
  partnerName: string;
}) {
  const agree = row.mine === row.theirs;

  /*
    Выбор подписываем именем, а не словом «я».

    Сперва было «вы: я», «Хилола: я» — и это читалось двусмысленно:
    непонятно, себя она выбрала или собеседника. С именами двусмысленности
    нет вовсе, а склонять их не приходится: имя стоит само по себе.
  */
  const label = (pick: string | null) =>
    pick === currentUserId ? myName : partnerName;

  return (
    <li
      className={cn(
        "rounded-3xl border p-4",
        agree
          ? "border-accent/35 bg-accent-soft/25"
          : "border-border bg-surface/88",
      )}
    >
      <p className="text-[15px] leading-snug text-text">{row.statement.body}</p>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
        <span className="text-text-muted">
          вы выбрали <span className="text-text">{label(row.mine)}</span>
        </span>
        <span className="text-text-muted">
          {partnerName} — <span className="text-text">{label(row.theirs)}</span>
        </span>

        <span
          className={cn(
            "ml-auto flex items-center gap-1",
            agree ? "text-accent" : "text-text-faint",
          )}
        >
          {agree ? (
            <>
              <Check size={13} aria-hidden />
              сошлись
            </>
          ) : (
            <>
              <X size={13} aria-hidden />
              разошлись
            </>
          )}
        </span>
      </div>

      {/* Убрать можно только своё: у встроенных автора нет,
          и политика базы их не отдаст. */}
      {row.statement.created_by && (
        <form action={deleteStatement} className="mt-2">
          <input type="hidden" name="id" value={row.statement.id} />
          <button
            type="submit"
            className="flex items-center gap-1 text-[12px] text-text-faint"
          >
            <Trash2 size={12} aria-hidden />
            убрать своё утверждение
          </button>
        </form>
      )}
    </li>
  );
}

/** Своё утверждение в общий набор. */
function Composer() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const [state, action, pending] = useActionState<WhoState, FormData>(
    async (prev, formData) => {
      const result = await addStatement(prev, formData);
      if (result.ok) {
        setOpen(false);
        router.refresh();
      }
      return result;
    },
    {},
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-8 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-border bg-surface/82 py-3 text-[14px] text-text-muted active:bg-surface-2"
      >
        <Plus size={16} aria-hidden />
        Своё утверждение
      </button>
    );
  }

  return (
    <form action={action} className="mt-8 space-y-2.5">
      <Input
        name="body"
        required
        maxLength={200}
        autoFocus
        placeholder="Кто из нас чаще забывает зарядить телефон?"
      />

      <div className="flex gap-2.5">
        <Button type="submit" disabled={pending}>
          {pending ? "Добавляем…" : "Добавить"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setOpen(false)}
        >
          Отмена
        </Button>
      </div>

      {state.error && (
        <p role="status" className="text-[14px] text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}
