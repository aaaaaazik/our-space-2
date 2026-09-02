"use client";

import { useSyncExternalStore } from "react";

import { cn } from "@/lib/utils/cn";

type Choice = "system" | "light" | "dark";

const STORAGE_KEY = "our-space-theme";

const options: Array<{ value: Choice; label: string }> = [
  { value: "system", label: "Как в системе" },
  { value: "light", label: "Светлая" },
  { value: "dark", label: "Тёмная" },
];

/*
  Выбранная тема хранится в браузере, а не в React.
  useSyncExternalStore — штатный способ читать такое внешнее хранилище:
  он корректно переживает отрисовку на сервере, где localStorage нет,
  и не требует useEffect с последующей перерисовкой.
*/

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Тема, изменённая в другой вкладке, применится и здесь.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function getSnapshot(): Choice {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

/** На сервере выбора нет — там всегда системная тема. */
const getServerSnapshot = (): Choice => "system";

function apply(next: Choice) {
  if (next === "system") {
    localStorage.removeItem(STORAGE_KEY);
    document.documentElement.removeAttribute("data-theme");
  } else {
    localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.setAttribute("data-theme", next);
  }
  for (const listener of listeners) listener();
}

export function ThemeSwitcher() {
  const choice = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  return (
    <div
      role="radiogroup"
      aria-label="Тема оформления"
      className="flex gap-1 rounded-2xl bg-surface-2 p-1"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={choice === option.value}
          onClick={() => apply(option.value)}
          className={cn(
            "min-h-10 flex-1 rounded-xl px-2 text-[13px] font-medium transition-colors",
            choice === option.value
              ? "bg-surface text-text shadow-card"
              : "text-text-muted",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
