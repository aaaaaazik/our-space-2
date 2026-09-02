import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Lock, Trash2 } from "lucide-react";

import { GuessForm } from "@/components/games/GuessForm";
import { Button } from "@/components/ui/Button";
import { asProfiles, nameOf, profilesQuery, requireSession } from "@/lib/data/couple";
import { loadRound, roundState } from "@/lib/data/drawings";

import { deleteRound, judgeGuess } from "../actions";

export default async function RoundPage(
  props: PageProps<"/games/draw/[id]">,
) {
  const { id } = await props.params;
  const { supabase, user } = await requireSession();

  const [profilesResult, round] = await Promise.all([
    profilesQuery(supabase),
    loadRound(supabase, id),
  ]);

  if (!round) notFound();

  const profiles = asProfiles(profilesResult);
  const state = roundState(round, user.id);
  const isAuthor = round.author_id === user.id;
  const authorName = nameOf(profiles, round.author_id);

  return (
    <div className="px-5 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <Link
        href="/games/draw"
        prefetch
        className="-ml-1 inline-flex min-h-9 items-center gap-0.5 text-[14px] text-text-muted"
      >
        <ChevronLeft size={17} aria-hidden />
        Рисовалка
      </Link>

      <div className="mt-3 overflow-hidden rounded-3xl border border-border bg-white">
        {round.url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={round.url}
            alt="Рисунок"
            className="aspect-square w-full object-contain"
          />
        )}
      </div>

      <p className="mt-2.5 text-center text-[12px] text-text-faint">
        Нарисовала {authorName} ·{" "}
        {new Date(round.created_at).toLocaleDateString("ru-RU", {
          day: "numeric",
          month: "long",
        })}
      </p>

      {/* Задание. Приходит с сервера только тем, кому его можно видеть. */}
      <div className="mt-5">
        {round.prompt ? (
          <div className="rounded-3xl border border-accent/25 bg-accent-soft/30 p-4">
            <p className="text-[12px] tracking-[0.18em] text-text-muted uppercase">
              Задание было
            </p>
            <p className="mt-1.5 font-display text-[22px] leading-snug text-text">
              {round.prompt}
            </p>
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-3xl border border-border bg-surface/82 p-4">
            <Lock
              size={17}
              className="mt-0.5 shrink-0 text-text-faint"
              aria-hidden
            />
            <p className="text-[14px] leading-relaxed text-text-muted">
              Задание скрыто до вашего ответа. Оно даже не приходит на
              устройство — так что подсмотреть нечего.
            </p>
          </div>
        )}
      </div>

      <div className="mt-5">
        {state === "to-guess" && <GuessForm roundId={round.id} />}

        {state === "waiting" && (
          <Note>Ждём, когда второй попробует угадать.</Note>
        )}

        {round.guess && (
          <div className="rounded-3xl border border-border bg-surface/88 p-4">
            <p className="text-[12px] tracking-wide text-text-faint uppercase">
              Ответ: {nameOf(profiles, round.guessed_by)}
            </p>
            <p className="mt-1.5 text-[17px] leading-snug text-text">
              {round.guess}
            </p>

            {round.is_correct !== null && (
              <p
                className={
                  "mt-2.5 text-[14px] " +
                  (round.is_correct ? "text-success" : "text-text-muted")
                }
              >
                {round.is_correct ? "✓ Засчитано" : "✗ Не угадала"}
              </p>
            )}
          </div>
        )}

        {state === "to-judge" && (
          <div className="mt-4">
            <p className="mb-2.5 text-center text-[14px] text-text-muted">
              Засчитываем?
            </p>
            <div className="grid grid-cols-2 gap-3">
              <form action={judgeGuess}>
                <input type="hidden" name="round_id" value={round.id} />
                <input type="hidden" name="correct" value="0" />
                <Button type="submit" variant="secondary" size="lg" block>
                  Не угадала
                </Button>
              </form>
              <form action={judgeGuess}>
                <input type="hidden" name="round_id" value={round.id} />
                <input type="hidden" name="correct" value="1" />
                <Button type="submit" size="lg" block>
                  Угадала
                </Button>
              </form>
            </div>
          </div>
        )}

        {state === "judging" && (
          <Note className="mt-4">
            {authorName} ещё не сказала, засчитано ли.
          </Note>
        )}
      </div>

      {isAuthor && (
        <form action={deleteRound} className="mt-8">
          <input type="hidden" name="id" value={round.id} />
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-1.5 text-[13px] text-text-faint"
          >
            <Trash2 size={13} aria-hidden />
            Удалить раунд
          </button>
        </form>
      )}
    </div>
  );
}

function Note({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={
        "rounded-3xl border border-border bg-surface/82 p-4 text-[14px] text-text-muted " +
        className
      }
    >
      {children}
    </p>
  );
}
