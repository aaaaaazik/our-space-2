import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, Plus } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Card";
import { asProfiles, nameOf, profilesQuery, requireSession } from "@/lib/data/couple";
import type { Profile, WordRound } from "@/types/database";

export const metadata: Metadata = { title: "Угадай слово" };

export default async function WordsPage() {
  const { supabase, user } = await requireSession();

  const [profilesResult, roundsResult] = await Promise.all([
    profilesQuery(supabase),
    supabase
      .from("word_rounds")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const profiles = asProfiles(profilesResult);
  const rounds = (roundsResult.data as WordRound[] | null) ?? [];

  // Сначала то, что ждёт именно меня.
  const mine = rounds.filter(
    (round) => round.author_id !== user.id && round.solved === null,
  );
  const rest = rounds.filter((round) => !mine.includes(round));

  const solved = rounds.filter((round) => round.solved === true).length;
  const finished = rounds.filter((round) => round.solved !== null).length;

  return (
    <div className="px-5 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <Link
        href="/games"
        prefetch
        className="-ml-1 inline-flex min-h-9 items-center gap-0.5 text-[14px] text-text-muted"
      >
        <ChevronLeft size={17} aria-hidden />
        Игры
      </Link>

      <div className="mt-2 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] leading-tight text-text">
            Угадай слово
          </h1>
          {finished > 0 && (
            <p className="mt-1 text-[13px] text-text-muted">
              угадано {solved} из {finished}
            </p>
          )}
        </div>

        <Link href="/games/words/new" prefetch className="shrink-0">
          <Button>
            <Plus size={16} aria-hidden />
            Загадать
          </Button>
        </Link>
      </div>

      {rounds.length === 0 ? (
        <EmptyState
          emoji="🧩"
          title="Пока ничего не загадано"
          description="Нажмите «Загадать» — выложите слово смайликами или дайте его перемешанными буквами."
        />
      ) : (
        <div className="mt-6 space-y-6">
          {mine.length > 0 && (
            <Section title="Твоя очередь" rounds={mine} profiles={profiles} />
          )}
          {rest.length > 0 && (
            <Section
              title={mine.length > 0 ? "Остальное" : "Все загадки"}
              rounds={rest}
              profiles={profiles}
            />
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  rounds,
  profiles,
}: {
  title: string;
  rounds: WordRound[];
  profiles: Profile[];
}) {
  return (
    <section>
      <h2 className="mb-2.5 text-[12px] tracking-wide text-text-faint uppercase">
        {title}
      </h2>

      <ul className="space-y-2.5">
        {rounds.map((round) => (
          <li key={round.id}>
            <Link
              href={`/games/words/${round.id}`}
              prefetch
              className="block rounded-3xl border border-border bg-surface/92 p-4 shadow-card transition-transform duration-150 active:scale-[0.99]"
            >
              <p className="text-[12px] tracking-wide text-text-faint uppercase">
                {round.kind === "rebus" ? "🧩 Ребус" : "🔤 Анаграмма"}
                {" · "}
                {nameOf(profiles, round.author_id)}
              </p>

              <p
                className={
                  "mt-1.5 break-all " +
                  (round.kind === "rebus"
                    ? "text-[26px] leading-tight"
                    : "font-display text-[20px] tracking-[0.12em]")
                }
              >
                {round.clue}
              </p>

              <p className="mt-2 text-[13px] text-text-muted">
                {round.solved === true
                  ? "✓ угадано"
                  : round.solved === false
                    ? "✗ не угадано"
                    : `${round.word_length} букв · попыток ${round.attempts} из 3`}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
