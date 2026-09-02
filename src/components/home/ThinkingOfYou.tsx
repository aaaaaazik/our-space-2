"use client";

import { useEffect, useState, useTransition } from "react";
import { Heart } from "lucide-react";

import { sendThought } from "@/app/(app)/actions";
import { cn } from "@/lib/utils/cn";

/** Сколько держится подпись «отправлено». */
const FLASH_MS = 2000;

/**
 * «Думаю о тебе» — кружок в левом нижнем углу главной.
 *
 * Именно в углу и именно небольшой: нажимают её мимоходом и помногу раз,
 * а место в середине экрана нужнее счётчику и воспоминанию дня. Кнопка
 * не гаснет и не блокируется — сколько нажали, столько и ушло.
 *
 * В правом углу живёт кнопка чата — вдвоём они держат низ экрана.
 */
export function ThinkingOfYou({ partnerName }: { partnerName: string }) {
  // Счётчик, а не флажок: при частых нажатиях каждое должно продлевать
  // подпись заново, а одно и то же значение эффект не перезапустит.
  const [sent, setSent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (sent === 0) return;
    const id = window.setTimeout(() => setSent(0), FLASH_MS);
    return () => window.clearTimeout(id);
  }, [sent]);

  function send() {
    startTransition(async () => {
      const result = await sendThought();

      if (result.error) {
        setError(result.error);
        return;
      }

      setError(null);
      setSent((n) => n + 1);
    });
  }

  const flashing = sent > 0;

  return (
    <div
      className={cn(
        "fixed left-4 z-30 flex items-center gap-2",
        // Над нижней навигацией: её высота плюс запас под полосу жестов.
        "bottom-[calc(env(safe-area-inset-bottom)+4.75rem)]",
      )}
    >
      <button
        type="button"
        onClick={send}
        aria-label={`Думаю о тебе — сказать это ${partnerName}`}
        className={cn(
          "flex size-[52px] shrink-0 items-center justify-center rounded-full",
          "bg-accent text-on-accent shadow-card",
          "transition-transform duration-150 active:scale-90",
        )}
      >
        <Heart
          size={22}
          // Заполненное сердце на пару секунд — видно, что нажатие ушло.
          fill={flashing ? "currentColor" : "none"}
          strokeWidth={2}
          aria-hidden
        />
      </button>

      {/*
        Подпись справа от кнопки — то есть внутрь экрана, а не за его край.
        Всегда в разметке и только меняет прозрачность: если добавлять и
        убирать её по-настоящему, кнопка дёргалась бы вбок при каждом
        нажатии.
      */}
      <span
        role="status"
        className={cn(
          "pointer-events-none rounded-full border px-3 py-1.5 text-[12px]",
          "shadow-card transition-opacity duration-300",
          error
            ? "border-danger/40 bg-surface text-danger"
            : "border-border bg-surface text-text-muted",
          flashing || error ? "opacity-100" : "opacity-0",
        )}
      >
        {error ?? "Отправлено"}
      </span>
    </div>
  );
}
