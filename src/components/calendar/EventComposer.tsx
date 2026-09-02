"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { FieldGroup, Input, Textarea } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { createEvent, type FormState } from "@/app/(app)/calendar/actions";
import { longDate } from "@/lib/utils/calendar";

/**
 * Новое событие на выбранный день.
 *
 * Одна галочка «каждый год» решает всё остальное: у дня рождения не бывает
 * времени начала и места, а у ужина в пятницу — повторения. Поэтому лишние
 * поля не показываются вовсе, а не стоят пустыми.
 */
export function EventComposer({
  open,
  onClose,
  day,
}: {
  open: boolean;
  onClose: () => void;
  /** «2026-03-04» — день, по которому нажали в сетке. */
  day: string;
}) {
  const router = useRouter();
  const [yearly, setYearly] = useState(false);

  const [state, action, pending] = useActionState<FormState, FormData>(
    async (prev, formData) => {
      const result = await createEvent(prev, formData);
      if (result.ok) {
        onClose();
        router.refresh();
      }
      return result;
    },
    {},
  );

  return (
    <Sheet open={open} onClose={onClose} title={longDate(day)}>
      <form action={action} id="event-form" className="space-y-4 pt-1 pb-4">
        <input type="hidden" name="date" value={day} />

        <FieldGroup label="Что за событие" htmlFor="event-title">
          <Input
            id="event-title"
            name="title"
            required
            maxLength={140}
            placeholder={yearly ? "День рождения мамы" : "Поехать за город"}
          />
        </FieldGroup>

        <label className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
          <input
            type="checkbox"
            name="yearly"
            checked={yearly}
            onChange={(e) => setYearly(e.target.checked)}
            className="size-5 shrink-0"
            style={{ accentColor: "var(--accent)" }}
          />
          <span className="text-[15px] text-text">
            Каждый год
            <span className="mt-0.5 block text-[13px] leading-snug text-text-muted">
              Дни рождения и годовщины. Такая дата будет отмечена в календаре
              всегда, и о ней напомнит уведомление за три дня.
            </span>
          </span>
        </label>

        {yearly ? (
          <FieldGroup
            label="Значок"
            htmlFor="event-emoji"
            hint="Необязательно — рядом с названием в календаре"
          >
            <Input
              id="event-emoji"
              name="emoji"
              maxLength={4}
              autoComplete="off"
              placeholder="🎂"
            />
          </FieldGroup>
        ) : (
          <>
            <FieldGroup
              label="Время"
              htmlFor="event-time"
              hint="Можно не указывать — тогда событие на весь день"
            >
              <Input id="event-time" name="time" type="time" />
            </FieldGroup>

            <FieldGroup label="Место" htmlFor="event-location">
              <Input
                id="event-location"
                name="location"
                placeholder="Необязательно"
              />
            </FieldGroup>

            <FieldGroup label="Заметка" htmlFor="event-description">
              <Textarea
                id="event-description"
                name="description"
                className="min-h-24"
                placeholder="Необязательно"
              />
            </FieldGroup>
          </>
        )}

        {state.error && (
          <p role="status" className="text-[15px] text-danger">
            {state.error}
          </p>
        )}
      </form>

      <div className="pb-2">
        <Button
          type="submit"
          form="event-form"
          size="lg"
          block
          disabled={pending}
        >
          {pending ? "Сохраняем…" : "Сохранить"}
        </Button>
      </div>
    </Sheet>
  );
}
