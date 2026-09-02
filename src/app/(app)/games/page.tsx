import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { Scoreboard, type Score } from "@/components/games/Scoreboard";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/Card";
import { asProfiles, profilesQuery, requireSession } from "@/lib/data/couple";
import type { QuestionPack } from "@/types/database";

export const metadata: Metadata = { title: "Игры" };

const ROUTE: Record<string, string> = {
  daily: "/games/daily",
};

export default async function GamesPage() {
  const { supabase, user } = await requireSession();

  // Вопросы и ответы отсюда убраны вместе с игрой «Я никогда не»: они
  // питали только её полосу прогресса, а у вопроса дня прогресса нет.
  const [
    profilesResult,
    packsResult,
    loveResult,
    roundsResult,
    ordersResult,
    wordsResult,
    whoStatementsResult,
    whoAnswersResult,
    heartsResult,
  ] = await Promise.all([
      profilesQuery(supabase),
      supabase.from("question_packs").select("*").order("created_at"),
      supabase
        .from("love_results")
        .select("completed_at")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("drawing_rounds")
        .select("author_id, guessed_by, guess, is_correct"),
      // Заказы: рисунок ждут от второго, оценку — от заказчика.
      supabase
        .from("drawing_orders")
        .select("ordered_by, storage_path, score"),
      supabase.from("word_rounds").select("author_id, solved"),
      // Утверждения «Кто из нас?» и мои ответы на них — для подсказки,
      // сколько ещё ждут.
      supabase.from("who_statements").select("id"),
      supabase.from("who_answers").select("statement_id").eq("author_id", user.id),
      // Идущая партия «Сердечного боя» — чтобы подсказать, чьего хода ждут.
      supabase
        .from("hearts_games")
        .select("id, turn")
        .is("winner", null)
        .limit(1)
        .maybeSingle(),
    ]);

  const profiles = asProfiles(profilesResult);

  const rounds =
    (roundsResult.data as Array<{
      author_id: string;
      guessed_by: string | null;
      guess: string | null;
      is_correct: boolean | null;
    }> | null) ?? [];

  const words =
    (wordsResult.data as Array<{
      author_id: string;
      solved: boolean | null;
    }> | null) ?? [];

  // Балл получает тот, кто угадал, а не тот, кто загадывал.
  // В словах угадывающий отдельно не записан — но угадывать может только
  // не автор, поэтому решённая загадка засчитывается второму.
  const scores: Score[] = profiles.map((profile) => {
    const drawn = rounds.filter(
      (r) => r.guessed_by === profile.id && r.is_correct !== null,
    );
    const guessedWords = words.filter(
      (w) => w.author_id !== profile.id && w.solved !== null,
    );

    return {
      profile,
      points:
        drawn.filter((r) => r.is_correct === true).length +
        guessedWords.filter((w) => w.solved === true).length,
      attempts: drawn.length + guessedWords.length,
    };
  });

  // Загадки, которые ждут именно моего ответа.
  const wordsForMe = words.filter(
    (w) => w.author_id !== user.id && w.solved === null,
  ).length;

  // Сколько раундов ждут именно моего действия: угадать чужой рисунок
  // или проверить догадку к своему.
  const pendingRounds = rounds.filter((round) =>
    round.author_id === user.id
      ? round.guess !== null && round.is_correct === null
      : round.guess === null,
  ).length;

  // То же по заказам: чужой заказ без рисунка ждёт меня, свой с рисунком
  // и без оценки — тоже.
  const orders =
    (ordersResult.data as Array<{
      ordered_by: string;
      storage_path: string | null;
      score: number | null;
    }> | null) ?? [];

  const pendingOrders = orders.filter((order) =>
    order.ordered_by === user.id
      ? order.storage_path !== null && order.score === null
      : order.storage_path === null,
  ).length;

  const pendingForMe = pendingRounds + pendingOrders;

  const whoAnswered = new Set(
    ((whoAnswersResult.data as Array<{ statement_id: string }> | null) ?? []).map(
      (a) => a.statement_id,
    ),
  );
  const whoLeft = (
    (whoStatementsResult.data as Array<{ id: string }> | null) ?? []
  ).filter((s) => !whoAnswered.has(s.id)).length;

  // Партия либо ждёт расстановки (ход ещё не назначен), либо чьего-то хода.
  const hearts = heartsResult.data as { id: string; turn: string | null } | null;
  const heartsLabel = !hearts
    ? null
    : hearts.turn === null
      ? "Расставьте сердца"
      : hearts.turn === user.id
        ? "Ваш ход"
        : "Ход второго";

  // Показываем только наборы, для которых есть страница. Это страховка на
  // случай, если убранная игра осталась в базе: карточка, ведущая в никуда,
  // хуже отсутствующей.
  const packs = ((packsResult.data as QuestionPack[] | null) ?? []).filter(
    (pack) => ROUTE[pack.slug],
  );

  return (
    <div>
      <PageHeader title="Игры" subtitle="Отвечайте по очереди, не подглядывая" />

      <div className="space-y-3 px-5">
        {profiles.length > 0 && <Scoreboard scores={scores} />}

        <Link
          href="/games/draw"
          prefetch
          className="flex items-center gap-4 rounded-3xl border border-border bg-surface/92 p-4 shadow-card transition-transform duration-150 active:scale-[0.99]"
        >
          <span className="text-2xl" aria-hidden>
            🎨
          </span>

          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-medium text-text">
              Рисовашки
            </span>
            <span className="mt-0.5 block text-[13px] leading-snug text-text-muted">
              Задание даёт приложение — или вы сами, и тогда ставите оценку.
            </span>
            {pendingForMe > 0 && (
              <span className="mt-1.5 block text-[12px] text-accent">
                Требует вас · {pendingForMe}
              </span>
            )}
          </span>

          <ChevronRight
            size={18}
            className="shrink-0 text-text-faint"
            aria-hidden
          />
        </Link>


        <Link
          href="/games/hearts"
          prefetch
          className="flex items-center gap-4 rounded-3xl border border-border bg-surface/92 p-4 shadow-card transition-transform duration-150 active:scale-[0.99]"
        >
          <span className="text-2xl" aria-hidden>
            💘
          </span>

          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-medium text-text">
              Сердечный бой
            </span>
            <span className="mt-0.5 block text-[13px] leading-snug text-text-muted">
              Морской бой, только вместо кораблей — спрятанные сердца.
            </span>
            {heartsLabel && (
              <span className="mt-1.5 block text-[12px] text-accent">
                {heartsLabel}
              </span>
            )}
          </span>

          <ChevronRight
            size={18}
            className="shrink-0 text-text-faint"
            aria-hidden
          />
        </Link>

        <Link
          href="/games/words"
          prefetch
          className="flex items-center gap-4 rounded-3xl border border-border bg-surface/92 p-4 shadow-card transition-transform duration-150 active:scale-[0.99]"
        >
          <span className="text-2xl" aria-hidden>
            🧩
          </span>

          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-medium text-text">
              Угадай слово
            </span>
            <span className="mt-0.5 block text-[13px] leading-snug text-text-muted">
              Ребус из смайликов или слово с перемешанными буквами.
            </span>
            {wordsForMe > 0 && (
              <span className="mt-1.5 block text-[12px] text-accent">
                Твоя очередь · {wordsForMe}
              </span>
            )}
          </span>

          <ChevronRight
            size={18}
            className="shrink-0 text-text-faint"
            aria-hidden
          />
        </Link>


        <Link
          href="/games/who"
          prefetch
          className="flex items-center gap-4 rounded-3xl border border-border bg-surface/92 p-4 shadow-card transition-transform duration-150 active:scale-[0.99]"
        >
          <span className="text-2xl" aria-hidden>
            🙋
          </span>

          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-medium text-text">
              Кто из нас?
            </span>
            <span className="mt-0.5 block text-[13px] leading-snug text-text-muted">
              Оба втайне показывают на одного — и смотрят, сошлись ли.
            </span>
            {whoLeft > 0 && (
              <span className="mt-1.5 block text-[12px] text-accent">
                Не отвечено · {whoLeft}
              </span>
            )}
          </span>

          <ChevronRight
            size={18}
            className="shrink-0 text-text-faint"
            aria-hidden
          />
        </Link>



        {/* Тест не набор вопросов: у каждого варианта свой язык,
            поэтому он живёт в коде и добавляется сюда отдельно. */}
        <Link
          href="/games/love"
          prefetch
          className="flex items-center gap-4 rounded-3xl border border-border bg-surface/92 p-4 shadow-card transition-transform duration-150 active:scale-[0.99]"
        >
          <span className="text-2xl" aria-hidden>
            💗
          </span>

          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-medium text-text">
              Языки любви
            </span>
            <span className="mt-0.5 block text-[13px] leading-snug text-text-muted">
              20 пар вопросов. Узнаете, что для каждого из вас важнее всего.
            </span>
            {loveResult.data?.completed_at && (
              <span className="mt-1.5 block text-[12px] text-accent">
                Пройдено · посмотреть результат
              </span>
            )}
          </span>

          <ChevronRight
            size={18}
            className="shrink-0 text-text-faint"
            aria-hidden
          />
        </Link>
      </div>

        {packs.length === 0 ? (
          <EmptyState
            emoji="🎲"
            title="Вопрос дня не загружен"
            description="Похоже, не применилась миграция базы. Запустите 0003_questions_and_games.sql в SQL Editor."
          />
        ) : (
          packs.map((pack) => {
            return (
              <Link
                key={pack.id}
                href={ROUTE[pack.slug] ?? "/games"}
                prefetch
                className="flex items-center gap-4 rounded-3xl border border-border bg-surface/92 p-4 shadow-card transition-transform duration-150 active:scale-[0.99]"
              >
                <span className="text-2xl" aria-hidden>
                  {pack.emoji ?? "🎲"}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-medium text-text">
                    {pack.title}
                  </span>
                  {pack.description && (
                    <span className="mt-0.5 block text-[13px] leading-snug text-text-muted">
                      {pack.description}
                    </span>
                  )}

                </span>

                <ChevronRight
                  size={18}
                  className="shrink-0 text-text-faint"
                  aria-hidden
                />
              </Link>
            );
          })
        )}

    </div>
  );
}
