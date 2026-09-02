import Link from "next/link";
import { MessageCircle } from "lucide-react";

/**
 * Чат — кружок в правом нижнем углу главной.
 *
 * Зеркально сердечку слева. Кружок не залит цветом, в отличие от него:
 * два одинаково ярких пятна по углам спорили бы друг с другом, а
 * «думаю о тебе» здесь всё-таки главное действие. Внимание к чату
 * привлекает значок непрочитанных — и только когда есть что читать.
 */
export function ChatButton({ unread }: { unread: number }) {
  return (
    <Link
      href="/chat"
      prefetch
      aria-label={
        unread > 0 ? `Чат, непрочитанных: ${unread}` : "Чат"
      }
      className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-30 flex size-[52px] items-center justify-center rounded-full border border-border bg-surface text-accent shadow-card transition-transform duration-150 active:scale-90"
    >
      <MessageCircle size={22} aria-hidden />

      {unread > 0 && (
        // Цифру показываем до девяти: дальше точное число уже ничего
        // не меняет, а кружок пришлось бы растягивать.
        <span
          aria-hidden
          className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-bg bg-accent-2 px-1 text-[10px] leading-none font-semibold text-on-accent"
        >
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}
