"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { FieldGroup, Input } from "@/components/ui/Field";
import {
  changePassword,
  updateCoupleSettings,
  updateProfile,
  type FormState,
} from "@/app/(app)/settings/actions";

const empty: FormState = {};

function Feedback({ state }: { state: FormState }) {
  if (!state.error && !state.message) return null;

  return (
    <p
      role="status"
      className={
        state.error
          ? "text-[14px] text-danger"
          : "text-[14px] text-text-muted"
      }
    >
      {state.error ?? state.message}
    </p>
  );
}

export function ProfileForm({ displayName }: { displayName: string }) {
  const [state, action, pending] = useActionState(updateProfile, empty);

  return (
    <form action={action} className="space-y-3">
      <FieldGroup label="Как тебя зовут" htmlFor="display-name">
        <Input
          id="display-name"
          name="display_name"
          defaultValue={displayName}
          maxLength={60}
          required
        />
      </FieldGroup>

      <Feedback state={state} />

      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Сохраняем…" : "Сохранить"}
      </Button>
    </form>
  );
}

export function CoupleForm({
  appName,
  relationshipStart,
}: {
  appName: string;
  relationshipStart: string;
}) {
  const [state, action, pending] = useActionState(updateCoupleSettings, empty);

  return (
    <form action={action} className="space-y-3">
      <FieldGroup
        label="Начало отношений"
        htmlFor="relationship-start"
        hint="От этой даты считается счётчик на главной."
      >
        <Input
          id="relationship-start"
          name="relationship_start"
          type="date"
          defaultValue={relationshipStart.slice(0, 10)}
          required
        />
      </FieldGroup>

      <FieldGroup label="Название пространства" htmlFor="app-name">
        <Input
          id="app-name"
          name="app_name"
          defaultValue={appName}
          maxLength={40}
        />
      </FieldGroup>

      <Feedback state={state} />

      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Сохраняем…" : "Сохранить"}
      </Button>
    </form>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePassword, empty);

  return (
    <form action={action} className="space-y-3">
      <FieldGroup
        label="Новый пароль"
        htmlFor="new-password"
        hint="Минимум 10 символов."
      >
        <Input
          id="new-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
        />
      </FieldGroup>

      <FieldGroup label="Ещё раз" htmlFor="confirm-password">
        <Input
          id="confirm-password"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
        />
      </FieldGroup>

      <Feedback state={state} />

      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Меняем…" : "Изменить пароль"}
      </Button>
    </form>
  );
}
