"use client";

import { useEffect, useRef } from "react";
import { intervalToDuration } from "date-fns";

import { plural, units } from "@/lib/utils/plural";

/** Каждой плитке свой цвет: сиреневый, розовый, кремовый. */
const TILES = [
  { forms: units.year, color: "text-accent" },
  { forms: units.month, color: "text-accent-2" },
  { forms: units.day, color: "text-[#f0d9a8]" },
] as const;

const pad = (n: number) => String(n).padStart(2, "0");

/** Неразрывный пробел: держит высоту строки, пока цифры ещё не посчитаны. */
const NBSP = " ";

/**
 * Счётчик «мы вместе уже…». Тикает раз в секунду без перезагрузки страницы.
 *
 * Цифры вписываются прямо в готовые элементы, а не через состояние React.
 *
 * Раньше здесь каждую секунду обновлялось состояние — то есть раз в секунду
 * React заново собирал карточку, а браузер пересчитывал стили. Само по себе
 * это быстро, но именно в этот момент подрагивало всё остальное на экране:
 * тикающая секунда и есть тот самый рывок раз в секунду. Текст в уже
 * существующем элементе меняется без всего этого.
 */
export function Counter({ startISO }: { startISO: string }) {
  const values = useRef<Array<HTMLParagraphElement | null>>([]);
  const words = useRef<Array<HTMLParagraphElement | null>>([]);
  const clock = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const start = new Date(startISO);

    const tick = () => {
      // intervalToDuration учитывает разную длину месяцев,
      // поэтому «4 месяца» здесь — настоящие календарные месяцы.
      const d = intervalToDuration({ start, end: new Date() });
      const parts = [d.years ?? 0, d.months ?? 0, d.days ?? 0];

      parts.forEach((n, i) => {
        const value = values.current[i];
        const word = words.current[i];
        // Сравнение перед записью: год и месяц меняются раз в полгода,
        // а лишняя запись в textContent — это лишняя перерисовка.
        const next = String(n);
        if (value && value.textContent !== next) value.textContent = next;

        const label = plural(n, TILES[i].forms);
        if (word && word.textContent !== label) word.textContent = label;
      });

      if (clock.current) {
        clock.current.textContent = `${pad(d.hours ?? 0)} : ${pad(
          d.minutes ?? 0,
        )} : ${pad(d.seconds ?? 0)}`;
      }
    };

    tick();
    const id = window.setInterval(tick, 1000);

    // Вкладку свернули и вернули — пересчитываем сразу, не дожидаясь секунды.
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [startISO]);

  return (
    // contain: paint — обновления цифр не выходят за пределы карточки
    // и не заставляют браузер трогать остальную страницу.
    <div className="relative [contain:paint]">
      {/*
        Рамка с градиентом. Сделана подложкой с отступом в один пиксель,
        а не рамкой: обычный border не умеет быть градиентным.
      */}
      <div className="rounded-[28px] bg-gradient-to-br from-accent/70 via-accent-2/40 to-accent/60 p-px">
        <div className="rounded-[27px] bg-surface/88 px-4 pt-5 pb-4">
          <p className="text-center text-[12px] tracking-[0.18em] text-text-muted uppercase">
            Вместе уже
          </p>

          <div className="mt-4 grid grid-cols-3 gap-2">
            {TILES.map((tile, i) => (
              <div
                key={i}
                className="rounded-2xl border border-border bg-surface-2/70 px-1 py-3 text-center"
              >
                <p
                  ref={(el) => {
                    values.current[i] = el;
                  }}
                  className={`tabular font-display text-[30px] leading-none ${tile.color}`}
                >
                  {NBSP}
                </p>
                <p
                  ref={(el) => {
                    words.current[i] = el;
                  }}
                  className="mt-1.5 text-[11px] text-text-muted"
                >
                  {NBSP}
                </p>
              </div>
            ))}
          </div>

          <p
            ref={clock}
            className="tabular mt-3.5 text-center text-[15px] text-text-muted"
          >
            {NBSP}
          </p>
        </div>
      </div>
    </div>
  );
}
