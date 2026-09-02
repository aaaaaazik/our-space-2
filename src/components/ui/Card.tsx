import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-border bg-surface shadow-card",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Пустое состояние раздела: короткий текст и, при необходимости, действие. */
export function EmptyState({
  emoji,
  title,
  description,
  action,
}: {
  emoji: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-8 py-14 text-center">
      <div className="mb-3 text-3xl" aria-hidden>
        {emoji}
      </div>
      <h3 className="font-display text-lg text-text">{title}</h3>
      <p className="mt-1.5 max-w-xs text-[15px] leading-relaxed text-text-muted">
        {description}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
