import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Lock, Trash2 } from "lucide-react";

import { WordGuess } from "@/components/games/WordGuess";
import { asProfiles, nameOf, profilesQuery, requireSession } from "@/lib/data/couple";
import type { WordRound, WordSecret } from "@/types/database";

import { deleteWordRound } from "../actions";

export default async function WordRoundPage(
  props: PageProps<"/games/words/[id]">,
) {
  const { id } = await props.params;
  const { supabase, user } = await requireSession();

  const [profilesResult, roundResult, secretResult] = await Promise.all([
    profilesQuery(supabase),
    supabase.from("word_rounds").select("*").eq("id", id).maybeSingle(),
    // Придёт, только если угадал или попытки кончились.
    supabase.from("word_secrets").select("*").eq("round_id", id).maybeSingle(),
  ]);

  const round = roundResult.data as WordRound | null;
  if (!round) notFound();

  const secret = secretResult.data as WordSecret | null;
  const profiles = asProfiles(profilesResult);
  const isAuthor = round.author_id === user.id;
  const authorName = nameOf(profiles, round.author_id);

  return (
    <div className="px-5 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <Link
        href="/games/words"
        prefetch
        className="-ml-1 inline-flex min-h-9 items-center gap-0.5 text-[14px] text-text-muted"
      >
        <ChevronLeft size={17} aria-hidden />
        Угадай слово
      </Link>

      <p className="mt-3 text-[12px] tracking-wide text-text-faint uppercase">
        {round.kind === "rebus" ? "🧩 Ребус" : "🔤 Анаграмма"} · загадала{" "}
        {authorName}
      </p>

      {/* Сама загадка */}
      <div className="mt-3 rounded-[28px] border border-accent/25 bg-accent-soft/30 p-6 text-center">
        <p
          className={
            "break-all " +
            (round.kind === "rebus"
              ? "text-[40px] leading-tight"
              : "font-display text-[30px] tracking-[0.2em]")
          }
        >
          {round.clue}
        </p>

        <p className="mt-4 text-[13px] text-text-muted">
          {round.word_length} букв
        </p>
      </div>

      <div className="mt-5">
        {round.solved === null ? (
          isAuthor ? (
            <Note>
              Ждём, когда {profiles.length > 1 ? "второй" : "он"} попробует
              угадать. Попыток сделано: {round.attempts} из 3.
            </Note>
          ) : (
            <WordGuess roundId={round.id} attempts={round.attempts} />
          )
        ) : (
          <div
            className={
              "rounded-3xl border p-5 text-center " +
              (round.solved
                ? "border-success/30 bg-success/10"
                : "border-border bg-surface/88")
            }
          >
            <p className="text-2xl" aria-hidden>
              {round.solved ? "🎉" : "🙈"}
            </p>
            <p className="mt-2 text-[15px] text-text">
              {round.solved ? "Угадано" : "Не угадано"}
              {" · "}
              {round.attempts}{" "}
              {round.attempts === 1 ? "попытка" : "попытки"}
            </p>
          </div>
        )}
      </div>

      {/* Слово. Приходит с сервера только тому, кому его уже можно видеть. */}
      <div className="mt-4">
        {secret ? (
          <div className="rounded-3xl border border-border bg-surface/88 p-4 text-center">
            <p className="text-[12px] tracking-wide text-text-faint uppercase">
              Загадано было
            </p>
            <p className="mt-1.5 font-display text-[24px] text-text">
              {secret.word}
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
              Слово скрыто до конца игры. Оно даже не приходит на устройство —
              подсмотреть нечего.
            </p>
          </div>
        )}
      </div>

      {isAuthor && (
        <form action={deleteWordRound} className="mt-8">
          <input type="hidden" name="id" value={round.id} />
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-1.5 text-[13px] text-text-faint"
          >
            <Trash2 size={13} aria-hidden />
            Удалить загадку
          </button>
        </form>
      )}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-3xl border border-border bg-surface/82 p-4 text-[14px] text-text-muted">
      {children}
    </p>
  );
}
