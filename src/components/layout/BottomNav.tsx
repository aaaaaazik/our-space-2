"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Dices, Ellipsis, Home, Images } from "lucide-react";

import { cn } from "@/lib/utils/cn";

// Чата здесь намеренно нет: он вынесен кружком в угол главной, рядом
// с «думаю о тебе». Шестая вкладка сжимала подписи до нечитаемого.
const items = [
  { href: "/", label: "Главная", icon: Home },
  { href: "/memories", label: "Фото", icon: Images },
  { href: "/diary", label: "Дневник", icon: BookOpen },
  { href: "/games", label: "Игры", icon: Dices },
  { href: "/more", label: "Ещё", icon: Ellipsis },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Основная навигация"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-border",
        // Полупрозрачный фон с размытием — лёгкий намёк на нативную панель iOS.
        "bg-surface/85 backdrop-blur-xl",
        // Отступ под полосу жестов iPhone.
        "pb-[env(safe-area-inset-bottom)]",
      )}
    >
      <ul className="mx-auto flex max-w-lg">
        {items.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);

          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                // Загружаем страницу заранее, пока человек её ещё не открыл.
                // Разделов всего пять, поэтому это дёшево и делает
                // переключение вкладок мгновенным.
                prefetch
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 pt-1.5 pb-1",
                  "transition-colors duration-150",
                  active ? "text-accent" : "text-text-faint",
                )}
              >
                <Icon
                  size={22}
                  strokeWidth={active ? 2.2 : 1.8}
                  aria-hidden
                />
                <span className="text-[11px] leading-none font-medium">
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
