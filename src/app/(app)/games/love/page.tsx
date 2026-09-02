import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { LoveTest } from "@/components/games/LoveTest";
import { asProfiles, profilesQuery, requireSession } from "@/lib/data/couple";
import {
  emptyScores,
  LOVE_PAIRS,
  type Scores,
} from "@/lib/games/loveLanguages";
import type { LoveResult } from "@/types/database";

export const metadata: Metadata = { title: "Языки любви" };

/** Из базы приходит обычный объект — приводим его к нужной форме. */
function toScores(raw: Record<string, number> | null | undefined): Scores {
  const scores = emptyScores();
  if (!raw) return scores;

  for (const key of Object.keys(scores) as Array<keyof Scores>) {
    const value = raw[key];
    if (typeof value === "number") scores[key] = value;
  }
  return scores;
}

export default async function LovePage() {
  const { supabase, user } = await requireSession();

  const [profilesResult, resultsResult] = await Promise.all([
    profilesQuery(supabase),
    // Чужой результат придёт, только если сам прошёл тест до конца —
    // это решает политика доступа, а не код здесь.
    supabase.from("love_results").select("*"),
  ]);

  const profiles = asProfiles(profilesResult);
  const partner = profiles.find((p) => p.id !== user.id);

  const results = (resultsResult.data as LoveResult[] | null) ?? [];
  const mine = results.find((r) => r.user_id === user.id) ?? null;
  const theirs = results.find((r) => r.user_id !== user.id) ?? null;

  const completed = Boolean(mine?.completed_at);

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

      {!completed && (
        <div className="mt-2">
          <h1 className="font-display text-[26px] leading-snug text-text">
            Языки любви
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-text-muted">
            {LOVE_PAIRS.length} пар. Выбирайте, что приятнее — не что
            правильнее. Результат {partner?.display_name ?? "второго"}{" "}
            откроется, когда закончите свой.
          </p>
        </div>
      )}

      <div className="mt-6">
        <LoveTest
          initialAnswers={mine?.answers ?? {}}
          myScores={mine ? toScores(mine.scores) : null}
          theirScores={
            theirs?.completed_at ? toScores(theirs.scores) : null
          }
          partnerName={partner?.display_name ?? "Второй"}
          completed={completed}
        />
      </div>
    </div>
  );
}
