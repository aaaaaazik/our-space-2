import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Trash2 } from "lucide-react";

import { OrderDrawing } from "@/components/games/OrderDrawing";
import { ScoreOrder } from "@/components/games/ScoreOrder";
import {
  asProfiles,
  nameOf,
  profilesQuery,
  requireSession,
} from "@/lib/data/couple";
import { loadOrder, orderState } from "@/lib/data/drawings";

import { deleteOrder } from "../../actions";

export default async function OrderPage(
  props: PageProps<"/games/draw/orders/[id]">,
) {
  const { id } = await props.params;
  const { supabase, user } = await requireSession();

  const [profilesResult, order] = await Promise.all([
    profilesQuery(supabase),
    loadOrder(supabase, id),
  ]);

  if (!order) notFound();

  const profiles = asProfiles(profilesResult);
  const state = orderState(order, user.id);
  const isCustomer = order.ordered_by === user.id;
  const customerName = nameOf(profiles, order.ordered_by);

  return (
    <div className="px-5 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <Link
        href="/games/draw"
        prefetch
        className="-ml-1 inline-flex min-h-9 items-center gap-0.5 text-[14px] text-text-muted"
      >
        <ChevronLeft size={17} aria-hidden />
        Рисовашки
      </Link>

      {/* Задание открыто обоим: без него рисовать нечего. */}
      <div className="mt-3 rounded-3xl border border-accent/25 bg-accent-soft/30 p-4">
        <p className="text-[12px] tracking-[0.18em] text-text-muted uppercase">
          Заказ от {customerName}
        </p>
        <p className="mt-1.5 font-display text-[22px] leading-snug text-text">
          {order.task}
        </p>
      </div>

      {order.url && (
        <div className="mt-4 overflow-hidden rounded-3xl border border-border bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={order.url}
            alt="Рисунок"
            className="aspect-square w-full object-contain"
          />
        </div>
      )}

      {state === "to-draw" && <OrderDrawing orderId={order.id} />}

      {state === "waiting" && (
        <Note className="mt-4">Ждём рисунок.</Note>
      )}

      {state === "to-score" && <ScoreOrder orderId={order.id} />}

      {state === "scoring" && (
        <Note className="mt-4">Нарисовано. Ждём оценку.</Note>
      )}

      {order.score !== null && (
        <p className="mt-5 text-center">
          <span className="font-display text-[34px] leading-none text-accent">
            {order.score}
          </span>
          <span className="ml-1 text-[15px] text-text-muted">из 10</span>
        </p>
      )}

      {isCustomer && (
        <form action={deleteOrder} className="mt-8">
          <input type="hidden" name="id" value={order.id} />
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-1.5 text-[13px] text-text-faint"
          >
            <Trash2 size={13} aria-hidden />
            Удалить заказ
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
        "rounded-3xl border border-border bg-surface/82 p-4 text-center text-[14px] text-text-muted " +
        className
      }
    >
      {children}
    </p>
  );
}
