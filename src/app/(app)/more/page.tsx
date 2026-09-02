import type { Metadata } from "next";
import Link from "next/link";
import {
  CalendarDays,
  ChevronRight,
  Gift,
  MessageCircle,
  Settings,
} from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { requireSession } from "@/lib/data/couple";

export const metadata: Metadata = { title: "Ещё" };

// Чат сюда продублирован намеренно: его кружок висит только на главной,
// и без этой строки с других страниц до переписки было бы не добраться.
const links = [
  { href: "/chat", label: "Чат", icon: MessageCircle },
  { href: "/calendar", label: "Календарь", icon: CalendarDays },
  { href: "/wishlist", label: "Желания", icon: Gift },
  { href: "/settings", label: "Настройки", icon: Settings },
] as const;

export default async function MorePage() {
  await requireSession();

  return (
    <div>
      <PageHeader title="Ещё" />

      <div className="px-5">
        <ul className="overflow-hidden rounded-3xl border border-border bg-surface shadow-card">
          {links.map(({ href, label, icon: Icon }, i) => (
            <li key={href}>
              <Link
                href={href}
                className={
                  "flex min-h-14 items-center gap-3.5 px-4 active:bg-surface-2 " +
                  (i > 0 ? "border-t border-border" : "")
                }
              >
                <Icon size={19} className="text-text-muted" aria-hidden />
                <span className="flex-1 text-[15px] text-text">{label}</span>
                <ChevronRight size={18} className="text-text-faint" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>

        <p className="mt-6 px-1 text-[13px] leading-relaxed text-text-faint">
          Дни рождения и годовщины живут в календаре: отметьте дату галочкой
          «каждый год», и о ней напомнит уведомление за три дня.
        </p>
      </div>
    </div>
  );
}
