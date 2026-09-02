import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, Pencil, Plus } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Card";
import { asProfiles, nameOf, profilesQuery, requireSession } from "@/lib/data/couple";
import {
  loadOrders,
  loadRounds,
  orderState,
  roundState,
  type OrderWithArt,
  type RoundWithArt,
} from "@/lib/data/drawings";
import type { Profile } from "@/types/database";

export const metadata: Metadata = { title: "Рисовашки" };

const STATE_LABEL: Record<string, string> = {
  "to-guess": "Твоя очередь угадывать",
  waiting: "Ждём догадку",
  "to-judge": "Проверь ответ",
  judging: "Ждём проверку",
  done: "",
};

const ORDER_LABEL: Record<string, string> = {
  "to-draw": "Ваша очередь рисовать",
  waiting: "Ждём рисунок",
  "to-score": "Поставьте оценку",
  scoring: "Ждём оценку",
  done: "",
};

export default async function DrawPage() {
  const { supabase, user } = await requireSession();

  const [profilesResult, rounds, orders] = await Promise.all([
    profilesQuery(supabase),
    loadRounds(supabase),
    loadOrders(supabase),
  ]);

  const profiles = asProfiles(profilesResult);

  // Сначала то, что требует действия именно от меня.
  const mine = rounds.filter(
    (r) => roundState(r, user.id) === "to-guess" || roundState(r, user.id) === "to-judge",
  );
  const rest = rounds.filter((r) => !mine.includes(r));

  const guessedRight = rounds.filter((r) => r.is_correct === true).length;
  const judged = rounds.filter((r) => r.is_correct !== null).length;

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
            Рисовашки
          </h1>
          {judged > 0 && (
            <p className="mt-1 text-[13px] text-text-muted">
              угадано {guessedRight} из {judged}
            </p>
          )}
        </div>

        {/* Два режима: приложение даёт задание — или его даёте вы. */}
        <div className="flex shrink-0 flex-col gap-2">
          <Link href="/games/draw/new" prefetch>
            <Button block>
              <Pencil size={16} aria-hidden />
              Рисовать
            </Button>
          </Link>
          <Link href="/games/draw/orders/new" prefetch>
            <Button block variant="secondary">
              <Plus size={16} aria-hidden />
              Заказать
            </Button>
          </Link>
        </div>
      </div>

      {orders.length > 0 && (
        <div className="mt-6">
          <Orders orders={orders} profiles={profiles} userId={user.id} />
        </div>
      )}

      {rounds.length === 0 && orders.length === 0 ? (
        <EmptyState
          emoji="🎨"
          title="Пока ничего не нарисовано"
          description="Нажмите «Рисовать» — приложение даст задание, а второй попробует угадать, что получилось."
        />
      ) : (
        <div className="mt-6 space-y-6">
          {mine.length > 0 && (
            <Section
              title="Требует вас"
              rounds={mine}
              profiles={profiles}
              userId={user.id}
            />
          )}
          {rest.length > 0 && (
            <Section
              title={mine.length > 0 ? "Остальное" : "Все раунды"}
              rounds={rest}
              profiles={profiles}
              userId={user.id}
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
  userId,
}: {
  title: string;
  rounds: RoundWithArt[];
  profiles: Profile[];
  userId: string;
}) {
  return (
    <section>
      <h2 className="mb-2.5 text-[12px] tracking-wide text-text-faint uppercase">
        {title}
      </h2>

      <ul className="grid grid-cols-2 gap-3">
        {rounds.map((round) => {
          const state = roundState(round, userId);
          const label = STATE_LABEL[state];

          return (
            <li key={round.id}>
              <Link
                href={`/games/draw/${round.id}`}
                prefetch
                className="block overflow-hidden rounded-3xl border border-border bg-surface/92 shadow-card transition-transform duration-150 active:scale-[0.98]"
              >
                <div className="aspect-square bg-white">
                  {round.url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={round.url}
                      alt="Рисунок"
                      loading="lazy"
                      className="size-full object-contain"
                    />
                  )}
                </div>

                <div className="px-3 py-2.5">
                  <p className="truncate text-[13px] text-text">
                    {round.prompt ?? "Задание скрыто"}
                  </p>
                  <p className="mt-0.5 truncate text-[12px] text-text-faint">
                    {label ||
                      (round.is_correct
                        ? "✓ угадала"
                        : "✗ не угадала") +
                        " · " +
                        nameOf(profiles, round.author_id)}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Заказы: задание видно сразу, прятать нечего. */
function Orders({
  orders,
  profiles,
  userId,
}: {
  orders: OrderWithArt[];
  profiles: Profile[];
  userId: string;
}) {
  return (
    <section>
      <h2 className="mb-2.5 text-[12px] tracking-wide text-text-faint uppercase">
        Заказы
      </h2>

      <ul className="space-y-2.5">
        {orders.map((order) => {
          const state = orderState(order, userId);
          const label = ORDER_LABEL[state];

          return (
            <li key={order.id}>
              <Link
                href={`/games/draw/orders/${order.id}`}
                prefetch
                className="flex items-center gap-3.5 rounded-3xl border border-border bg-surface/92 p-3 shadow-card transition-transform duration-150 active:scale-[0.99]"
              >
                <span className="size-14 shrink-0 overflow-hidden rounded-2xl bg-white">
                  {order.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={order.url}
                      alt="Рисунок"
                      loading="lazy"
                      className="size-full object-contain"
                    />
                  ) : (
                    <span className="flex size-full items-center justify-center text-[20px]">
                      🎨
                    </span>
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] text-text">
                    {order.task}
                  </span>
                  <span className="mt-0.5 block text-[12px] text-text-faint">
                    от {nameOf(profiles, order.ordered_by)}
                  </span>
                  {label && (
                    <span className="mt-1 block text-[12px] text-accent">
                      {label}
                    </span>
                  )}
                </span>

                {order.score !== null && (
                  <span className="shrink-0 text-right">
                    <span className="font-display text-[22px] leading-none text-accent">
                      {order.score}
                    </span>
                    <span className="block text-[11px] text-text-faint">
                      из 10
                    </span>
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
