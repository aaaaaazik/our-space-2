import { Trophy } from "lucide-react";

import type { Profile } from "@/types/database";

export type Score = {
  profile: Profile;
  /** Угадал чужих рисунков — по баллу за каждый. */
  points: number;
  /** Сколько всего пробовал: чтобы было видно не только очки, но и точность. */
  attempts: number;
};

/**
 * Счёт за Рисовашки: балл за каждый угаданный рисунок.
 * Начисляется тому, кто угадал, а не тому, кто рисовал.
 */
export function Scoreboard({ scores }: { scores: Score[] }) {
  const total = scores.reduce((sum, s) => sum + s.points, 0);
  const leader = scores.reduce(
    (best, s) => (s.points > best.points ? s : best),
    scores[0],
  );
  const tie = scores.every((s) => s.points === scores[0]?.points);

  return (
    <div className="rounded-3xl border border-border bg-surface/92 p-4 shadow-card">
      <p className="flex items-center gap-1.5 text-[12px] tracking-wide text-text-faint uppercase">
        <Trophy size={12} aria-hidden />
        Счёт
      </p>

      <ul className="mt-3 space-y-3">
        {scores.map((score) => {
          const share =
            total > 0 ? Math.round((score.points / total) * 100) : 0;
          const isLeader = !tie && score.profile.id === leader?.profile.id;

          return (
            <li key={score.profile.id}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[15px] text-text">
                  {isLeader && "👑 "}
                  {score.profile.display_name}
                </span>
                <span className="tabular text-[15px] font-medium text-text">
                  {score.points}
                  {score.attempts > 0 && (
                    <span className="ml-1.5 text-[12px] font-normal text-text-faint">
                      из {score.attempts}
                    </span>
                  )}
                </span>
              </div>

              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-500"
                  style={{ width: `${share}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      {total === 0 && (
        <p className="mt-3 text-[13px] text-text-faint">
          Балл начисляется тому, кто угадал рисунок.
        </p>
      )}
    </div>
  );
}
