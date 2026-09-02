import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/utils/cn";

/*
  text-base (16px) обязателен для полей ввода: при меньшем размере
  Safari на iPhone автоматически зумит страницу при фокусе.
*/
const fieldBase =
  "w-full rounded-2xl border border-border bg-surface px-4 py-3 text-base text-text " +
  "placeholder:text-text-faint outline-none transition-colors " +
  "focus:border-accent disabled:text-text-faint";

export function Label({
  children,
  htmlFor,
}: {
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-[13px] font-medium text-text-muted"
    >
      {children}
    </label>
  );
}

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldBase, className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(fieldBase, "min-h-32 resize-y leading-relaxed", className)}
      {...props}
    />
  );
}

export function FieldGroup({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="mt-1.5 text-[13px] text-text-faint">{hint}</p>}
    </div>
  );
}
