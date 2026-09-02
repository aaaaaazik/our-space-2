import type { Metadata } from "next";

export const metadata: Metadata = { title: "Нет соединения" };

/**
 * Показывается, когда приложение запущено без интернета.
 * Страница намеренно статическая и не содержит личных данных.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-8 text-center">
      <p className="text-3xl" aria-hidden>
        🌙
      </p>
      <h1 className="mt-4 font-display text-2xl text-text">Нет соединения</h1>
      <p className="mt-2 max-w-xs text-[15px] leading-relaxed text-text-muted">
        Наши воспоминания хранятся в облаке. Как только интернет вернётся,
        всё снова будет на месте.
      </p>
    </main>
  );
}
