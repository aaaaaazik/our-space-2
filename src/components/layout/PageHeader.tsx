import type { ReactNode } from "react";

/**
 * Заголовок раздела. Отступ сверху учитывает вырез и Dynamic Island,
 * потому что в standalone-режиме контент начинается от самого верха экрана.
 */
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-4 px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-4">
      <div className="min-w-0">
        <h1 className="font-display text-[27px] leading-tight text-text">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-[14px] text-text-muted">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0 pt-1">{action}</div>}
    </header>
  );
}
