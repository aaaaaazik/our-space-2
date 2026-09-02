import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { DailyAnswer } from "@/components/games/DailyAnswer";
import { QuestionManager } from "@/components/games/QuestionManager";
import { EmptyState } from "@/components/ui/Card";
import { asProfiles, profilesQuery, requireSession } from "@/lib/data/couple";
import {
  answersQuery,
  dailyQuestionQuery,
  packQuery,
  pickDaily,
  questionsQuery,
  withAnswers,
} from "@/lib/data/questions";
import type { QuestionPack } from "@/types/database";

export const metadata: Metadata = { title: "Вопрос дня" };

export default async function DailyPage() {
  const { supabase, user } = await requireSession();

  // Всё одной волной: раньше набор, вопросы и ответы запрашивались
  // по очереди, и задержка до базы платилась трижды.
  const [
    profilesResult,
    packResult,
    questionsResult,
    answersResult,
    pickResult,
  ] = await Promise.all([
    profilesQuery(supabase),
    packQuery(supabase, "daily"),
    questionsQuery(supabase, "daily"),
    answersQuery(supabase),
    dailyQuestionQuery(supabase),
  ]);

  const pack = packResult.data as QuestionPack | null;
  const questions = withAnswers(
    questionsResult.data,
    answersResult.data,
    user.id,
  );

  if (!pack || questions.length === 0) {
    return (
      <Shell>
        <EmptyState
          emoji="💬"
          title={pack ? "Вопросов пока нет" : "Набор не найден"}
          description={
            pack
              ? "Добавьте свои вопросы, и они начнут появляться здесь."
              : "Похоже, не применилась миграция базы. Запустите 0003_questions_and_games.sql в SQL Editor."
          }
        />
      </Shell>
    );
  }

  // Один и тот же вопрос у обоих. Свои идут первыми, в порядке добавления,
  // и держатся, пока не ответят оба; когда свои кончаются, подготовленные
  // выбираются по дате — одна и та же дата всегда даёт один и тот же вопрос.
  const today = pickDaily(pickResult, questions, new Date());

  const profiles = asProfiles(profilesResult);
  const partner = profiles.find((p) => p.id !== user.id);

  if (!today) {
    return (
      <Shell>
        <EmptyState
          emoji="💬"
          title="Вопросов пока нет"
          description="Добавьте свои вопросы, и они начнут появляться здесь."
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="text-[12px] tracking-[0.18em] text-text-muted uppercase">
        {new Date().toLocaleDateString("ru-RU", {
          day: "numeric",
          month: "long",
        })}
      </p>

      <h1 className="mt-3 font-display text-[26px] leading-snug text-text">
        {today.body}
      </h1>

      <div className="mt-6">
        <DailyAnswer
          questionId={today.id}
          mine={today.mine}
          theirs={today.theirs}
          partnerName={partner?.display_name ?? "Второй"}
          myName={
            profiles.find((p) => p.id === user.id)?.display_name ?? "Я"
          }
        />
      </div>

      <QuestionManager
        packId={pack.id}
        questions={questions}
        currentUserId={user.id}
      />

      <p className="mt-5 text-center text-[12px] leading-relaxed text-text-faint">
        Свои вопросы идут первыми, в порядке добавления. Написанный сегодня
        появится завтра · всего {questions.length}
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
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

      <div className="mt-2">{children}</div>
    </div>
  );
}
