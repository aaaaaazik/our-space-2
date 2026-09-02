"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { FieldGroup, Input, Textarea } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { createWish, type FormState } from "@/app/(app)/wishlist/actions";

export function WishComposer() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(
    async (prev, formData) => {
      const result = await createWish(prev, formData);
      if (result.ok) {
        setOpen(false);
        router.refresh();
      }
      return result;
    },
    {},
  );

  return (
    <>
      <Button onClick={() => setOpen(true)} aria-label="Новое желание">
        <Plus size={18} aria-hidden />
        Добавить
      </Button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Новое желание">
        <form action={action} id="wish-form" className="space-y-4 pt-1 pb-4">
          <FieldGroup label="Чего хочется" htmlFor="wish-title">
            <Input
              id="wish-title"
              name="title"
              required
              maxLength={140}
              placeholder="Съездить в Японию"
            />
          </FieldGroup>

          <FieldGroup label="Описание" htmlFor="wish-description">
            <Textarea
              id="wish-description"
              name="description"
              className="min-h-24"
              placeholder="Необязательно"
            />
          </FieldGroup>

          <div className="grid grid-cols-2 gap-3">
            <FieldGroup label="Категория" htmlFor="wish-category">
              <Input
                id="wish-category"
                name="category"
                placeholder="Путешествия"
              />
            </FieldGroup>

            <FieldGroup label="Примерная цена" htmlFor="wish-price">
              <Input
                id="wish-price"
                name="price"
                type="text"
                inputMode="decimal"
                placeholder="120000"
              />
            </FieldGroup>
          </div>

          <FieldGroup label="Приоритет" htmlFor="wish-priority">
            <select
              id="wish-priority"
              name="priority"
              defaultValue="2"
              className="w-full rounded-2xl border border-border bg-surface px-4 py-3 text-base text-text outline-none focus:border-accent"
            >
              <option value="1">Когда-нибудь</option>
              <option value="2">Хотелось бы</option>
              <option value="3">Очень хочу</option>
            </select>
          </FieldGroup>

          {state.error && (
            <p role="status" className="text-[15px] text-danger">
              {state.error}
            </p>
          )}
        </form>

        <div className="pb-2">
          <Button
            type="submit"
            form="wish-form"
            size="lg"
            block
            disabled={pending}
          >
            {pending ? "Сохраняем…" : "Сохранить"}
          </Button>
        </div>
      </Sheet>
    </>
  );
}
