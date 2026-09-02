"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/Button";
import { FieldGroup, Input } from "@/components/ui/Field";
import {
  requestPasswordReset,
  signIn,
  type AuthState,
} from "@/app/(auth)/login/actions";

const empty: AuthState = {};

export function LoginForm({ next }: { next: string }) {
  const [mode, setMode] = useState<"signIn" | "reset">("signIn");
  const [signInState, signInAction, signingIn] = useActionState(signIn, empty);
  const [resetState, resetAction, resetting] = useActionState(
    requestPasswordReset,
    empty,
  );

  if (mode === "reset") {
    return (
      <form action={resetAction} className="space-y-4">
        <FieldGroup
          label="Почта"
          htmlFor="reset-email"
          hint="Пришлём ссылку для смены пароля."
        >
          <Input
            id="reset-email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            required
            placeholder="you@example.com"
          />
        </FieldGroup>

        {resetState.error && <Message tone="error">{resetState.error}</Message>}
        {resetState.message && <Message tone="ok">{resetState.message}</Message>}

        <Button type="submit" size="lg" block disabled={resetting}>
          {resetting ? "Отправляем…" : "Отправить письмо"}
        </Button>

        <Button variant="ghost" block onClick={() => setMode("signIn")}>
          Назад ко входу
        </Button>
      </form>
    );
  }

  return (
    <form action={signInAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />

      <FieldGroup label="Почта" htmlFor="email">
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          required
          placeholder="you@example.com"
        />
      </FieldGroup>

      <FieldGroup label="Пароль" htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
        />
      </FieldGroup>

      {signInState.error && <Message tone="error">{signInState.error}</Message>}

      <Button type="submit" size="lg" block disabled={signingIn}>
        {signingIn ? "Входим…" : "Войти"}
      </Button>

      <Button variant="ghost" block onClick={() => setMode("reset")}>
        Забыли пароль?
      </Button>
    </form>
  );
}

function Message({
  tone,
  children,
}: {
  tone: "error" | "ok";
  children: React.ReactNode;
}) {
  return (
    <p
      role="status"
      className={
        tone === "error"
          ? "rounded-2xl bg-accent-soft px-4 py-3 text-[15px] text-danger"
          : "rounded-2xl bg-surface-2 px-4 py-3 text-[15px] text-text-muted"
      }
    >
      {children}
    </p>
  );
}
