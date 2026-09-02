"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/Button";
import {
  updateNotificationSettings,
  type NotifyState,
} from "@/app/(app)/settings/notifications";
import type { NotificationSettings } from "@/types/database";

const TYPES = [
  { name: "chat", label: "💬 Сообщения" },
  { name: "thoughts", label: "💜 Думаю о тебе" },
  { name: "photos", label: "Новые фото и видео" },
  { name: "diary", label: "Записи в дневнике" },
  { name: "daily_question", label: "Вопрос дня" },
  { name: "games", label: "Игры и рекорды", hint: "приходят часто" },
  { name: "dates", label: "Годовщины и важные даты" },
] as const;

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function NotificationTypes({
  settings,
}: {
  settings: NotificationSettings | null;
}) {
  const [state, action, pending] = useActionState<NotifyState, FormData>(
    updateNotificationSettings,
    {},
  );

  const [quiet, setQuiet] = useState(
    settings?.quiet_from !== null && settings?.quiet_from !== undefined,
  );

  return (
    <form action={action} className="space-y-4">
      <ul className="space-y-1">
        {TYPES.map((type) => (
          <li key={type.name}>
            <label className="flex min-h-11 items-center justify-between gap-3">
              <span className="text-[15px] text-text">
                {type.label}
                {"hint" in type && (
                  <span className="ml-1.5 text-[12px] text-text-faint">
                    {type.hint}
                  </span>
                )}
              </span>
              <input
                type="checkbox"
                name={type.name}
                // Игровые события идут пачками — по умолчанию молчат.
                defaultChecked={
                  settings?.[type.name] ?? type.name !== "games"
                }
                className="size-5 accent-accent"
              />
            </label>
          </li>
        ))}
      </ul>

      <div className="rounded-2xl border border-border bg-surface-2/50 p-3.5">
        <label className="flex min-h-11 items-center justify-between gap-3">
          <span className="text-[15px] text-text">🔕 Не беспокоить</span>
          <input
            type="checkbox"
            name="quiet"
            checked={quiet}
            onChange={(e) => setQuiet(e.target.checked)}
            className="size-5 accent-accent"
          />
        </label>

        {quiet && (
          <div className="mt-2 flex items-center gap-2">
            <Select
              name="quiet_from"
              defaultValue={settings?.quiet_from ?? 23}
              label="С какого часа"
            />
            <span className="text-text-muted">—</span>
            <Select
              name="quiet_to"
              defaultValue={settings?.quiet_to ?? 8}
              label="До какого часа"
            />
          </div>
        )}

        {quiet && (
          <p className="mt-2 text-[13px] text-text-faint">
            В эти часы уведомления не придут. Проверяется по времени сервера.
          </p>
        )}
      </div>

      {(state.error || state.message) && (
        <p
          role="status"
          className={
            state.error ? "text-[14px] text-danger" : "text-[14px] text-text-muted"
          }
        >
          {state.error ?? state.message}
        </p>
      )}

      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Сохраняем…" : "Сохранить"}
      </Button>
    </form>
  );
}

function Select({
  name,
  defaultValue,
  label,
}: {
  name: string;
  defaultValue: number;
  label: string;
}) {
  return (
    <select
      name={name}
      aria-label={label}
      defaultValue={defaultValue}
      className="min-h-11 flex-1 rounded-2xl border border-border bg-surface px-3 text-base text-text outline-none focus:border-accent"
    >
      {HOURS.map((hour) => (
        <option key={hour} value={hour}>
          {String(hour).padStart(2, "0")}:00
        </option>
      ))}
    </select>
  );
}
