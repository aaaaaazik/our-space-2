import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/PageHeader";
import { Card, EmptyState } from "@/components/ui/Card";
import { WishComposer } from "@/components/wishlist/WishComposer";
import { WishNote } from "@/components/wishlist/WishNote";
import {
  asProfiles,
  nameOf,
  profilesQuery,
  requireSession,
} from "@/lib/data/couple";
import type { Wish, WishStatus } from "@/types/database";

import { setWishStatus } from "./actions";

export const metadata: Metadata = { title: "Желания" };

const STATUS_LABEL: Record<WishStatus, string> = {
  want: "💭 Хочу",
  planning: "📋 Планируем",
  soon: "🔥 Скоро",
  done: "✅ Исполнено",
};

/** Следующий статус по кругу — одно нажатие двигает желание вперёд. */
const NEXT_STATUS: Record<WishStatus, WishStatus> = {
  want: "planning",
  planning: "soon",
  soon: "done",
  done: "want",
};

export default async function WishlistPage() {
  const { supabase, user } = await requireSession();

  const [profilesResult, wishesResult] = await Promise.all([
    profilesQuery(supabase),
    supabase
      .from("wishes")
      .select("*")
      .order("status")
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  const profiles = asProfiles(profilesResult);
  const wishes = (wishesResult.data as Wish[] | null) ?? [];
  const done = wishes.filter((w) => w.status === "done").length;
  const progress = wishes.length > 0 ? (done / wishes.length) * 100 : 0;

  return (
    <div>
      <PageHeader
        title="Желания"
        subtitle={
          wishes.length > 0
            ? `${done} из ${wishes.length} исполнено`
            : undefined
        }
        action={<WishComposer />}
      />

      {wishes.length > 0 && (
        <div className="px-5 pb-5">
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      <div className="space-y-2.5 px-5">
        {wishes.length === 0 ? (
          <EmptyState
            emoji="🎁"
            title="Список желаний пуст"
            description="Добавьте то, о чём мечтаете вместе — от ужина в новом месте до поездки на другой конец света."
          />
        ) : (
          wishes.map((wish) => (
            <Card key={wish.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2
                    className={
                      "text-[15px] font-medium " +
                      (wish.status === "done"
                        ? "text-text-faint line-through"
                        : "text-text")
                    }
                  >
                    {wish.title}
                  </h2>

                  {wish.description && (
                    <p className="mt-1 text-[14px] leading-relaxed text-text-muted">
                      {wish.description}
                    </p>
                  )}

                  <p className="mt-2 text-[13px] text-text-faint">
                    {[
                      wish.category,
                      wish.price
                        ? `${wish.price.toLocaleString("ru-RU")} ${wish.currency}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>

                  <WishNote
                    wishId={wish.id}
                    note={wish.note}
                    authorName={
                      wish.note_by ? nameOf(profiles, wish.note_by) : null
                    }
                    canWrite={wish.created_by !== user.id}
                  />
                </div>

                {/* Форма без JS: работает даже если скрипты не загрузились */}
                <form action={setWishStatus} className="shrink-0">
                  <input type="hidden" name="id" value={wish.id} />
                  <input
                    type="hidden"
                    name="status"
                    value={NEXT_STATUS[wish.status]}
                  />
                  <button
                    type="submit"
                    className="min-h-11 rounded-2xl border border-border px-3 text-[13px] whitespace-nowrap text-text-muted active:bg-surface-2"
                  >
                    {STATUS_LABEL[wish.status]}
                  </button>
                </form>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
