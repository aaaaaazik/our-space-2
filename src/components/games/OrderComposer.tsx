"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Field";
import {
  createOrder,
  type FormState,
} from "@/app/(app)/games/draw/actions";

/**
 * Заказ: что нарисовать второму.
 *
 * Задание здесь не прячется, в отличие от обычного раунда, — рисующему
 * оно нужно целиком. Поэтому и форма простая: одно поле.
 */
export function OrderComposer({ partnerName }: { partnerName: string }) {
  const router = useRouter();

  const [state, action, pending] = useActionState<FormState, FormData>(
    async (prev, formData) => {
      const result = await createOrder(prev, formData);
      if (result.ok) {
        router.push("/games/draw");
        router.refresh();
      }
      return result;
    },
    {},
  );

  return (
    <form action={action} className="mt-3 space-y-4">
      <div>
        <h1 className="font-display text-[26px] leading-tight text-text">
          Заказ
        </h1>
        <p className="mt-1.5 text-[14px] leading-relaxed text-text-muted">
          Напишите, что нарисовать. {partnerName} увидит задание целиком —
          прятать здесь нечего, — нарисует, а оценку от 1 до 10 поставите вы.
        </p>
      </div>

      <Textarea
        name="task"
        required
        maxLength={200}
        autoFocus
        className="min-h-28"
        placeholder="Нарисуй нас двоих на море"
      />

      {state.error && (
        <p role="status" className="text-[15px] text-danger">
          {state.error}
        </p>
      )}

      <Button type="submit" size="lg" block disabled={pending}>
        {pending ? "Отправляем…" : "Заказать"}
      </Button>
    </form>
  );
}
