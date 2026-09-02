"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { scoreOrder } from "@/app/(app)/games/draw/actions";
import { cn } from "@/lib/utils/cn";

const VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * Оценка от 1 до 10.
 *
 * Десять кнопок, а не ползунок: ползунок на телефоне требует прицелиться,
 * а тут нужно одно нажатие. В два ряда по пять — в один десять кнопок
 * влезают только совсем узкими.
 */
export function ScoreOrder({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [chosen, setChosen] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function put(value: number) {
    if (pending) return;

    setChosen(value);
    setError(null);

    startTransition(async () => {
      const result = await scoreOrder(orderId, value);
      if (result.error) {
        setChosen(null);
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="mt-5">
      <p className="mb-2.5 text-center text-[14px] text-text-muted">
        Ваша оценка
      </p>

      <div className="grid grid-cols-5 gap-2">
        {VALUES.map((value) => (
          <button
            key={value}
            type="button"
            disabled={pending}
            onClick={() => put(value)}
            className={cn(
              "flex min-h-12 items-center justify-center rounded-2xl border",
              "text-[17px] transition-colors active:scale-95",
              chosen === value
                ? "border-accent bg-accent text-on-accent"
                : "border-border bg-surface text-text",
            )}
          >
            {value}
          </button>
        ))}
      </div>

      {error && (
        <p role="status" className="mt-2 text-center text-[14px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
