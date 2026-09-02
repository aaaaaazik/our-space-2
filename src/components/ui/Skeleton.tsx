import { cn } from "@/lib/utils/cn";

/**
 * Серый прямоугольник вместо контента, пока он грузится.
 * Показывается мгновенно при нажатии — экран сразу отзывается,
 * даже если данные ещё в пути.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-lg bg-surface-2", className)}
    />
  );
}

/** Заглушка заголовка раздела — повторяет отступы PageHeader. */
export function HeaderSkeleton() {
  return (
    <div className="flex items-start justify-between gap-4 px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-4">
      <div className="flex-1">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-2 h-3.5 w-24" />
      </div>
      <Skeleton className="h-11 w-28 rounded-2xl" />
    </div>
  );
}

/** Заглушка карточки списка. */
export function CardSkeleton({ lines = 2 }: { lines?: number }) {
  return (
    <div className="rounded-3xl border border-border bg-surface p-4">
      <Skeleton className="h-4.5 w-1/2" />
      <Skeleton className="mt-2.5 h-3 w-28" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="mt-2.5 h-3 w-full" />
      ))}
    </div>
  );
}
