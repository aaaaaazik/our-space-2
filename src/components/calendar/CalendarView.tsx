"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, MapPin, Plus, Repeat } from "lucide-react";

import { EventComposer } from "@/components/calendar/EventComposer";
import { DeleteEvent } from "@/components/calendar/DeleteEvent";
import { cn } from "@/lib/utils/cn";
import { plural, units } from "@/lib/utils/plural";
import {
  eventsForMonth,
  longDate,
  makeDay,
  monthGrid,
  monthTitle,
  parseDay,
  WEEKDAYS,
  type CalendarEvent,
  type CalendarItem,
} from "@/lib/utils/calendar";

export function CalendarView({
  items,
  todayKey,
}: {
  items: CalendarItem[];
  /** Сегодняшнее число по календарю пары — считает сервер, не браузер. */
  todayKey: string;
}) {
  const today = parseDay(todayKey);

  const [view, setView] = useState({ year: today.year, month: today.month });
  const [selected, setSelected] = useState(todayKey);
  const [composerOpen, setComposerOpen] = useState(false);

  const grid = useMemo(
    () => monthGrid(view.year, view.month),
    [view.year, view.month],
  );

  const byDay = useMemo(
    () => eventsForMonth(items, view.year, view.month),
    [items, view.year, view.month],
  );

  const dayEvents = byDay.get(selected) ?? [];

  /**
   * Листаем месяц и переносим выбор внутрь него: иначе список внизу
   * показывал бы день, которого на сетке уже не видно.
   */
  function goToMonth(year: number, month: number) {
    const next = new Date(year, month, 1);
    const y = next.getFullYear();
    const m = next.getMonth();

    setView({ year: y, month: m });
    setSelected(
      y === today.year && m === today.month ? todayKey : makeDay(y, m, 1),
    );
  }

  function selectDay(day: string) {
    setSelected(day);

    // Тап по числу соседнего месяца на краю сетки — переходим туда.
    const parsed = parseDay(day);
    if (parsed.month !== view.month || parsed.year !== view.year) {
      setView({ year: parsed.year, month: parsed.month });
    }
  }

  return (
    <div className="px-5">
      <header className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => goToMonth(view.year, view.month - 1)}
          aria-label="Предыдущий месяц"
          className="-ml-2 flex size-11 items-center justify-center text-text-muted active:text-accent"
        >
          <ChevronLeft size={22} aria-hidden />
        </button>

        <div className="text-center">
          <p className="font-display text-[19px] text-text first-letter:uppercase">
            {monthTitle(view.year, view.month)}
          </p>
          {(view.year !== today.year || view.month !== today.month) && (
            <button
              type="button"
              onClick={() => goToMonth(today.year, today.month)}
              className="mt-0.5 text-[12px] text-accent"
            >
              Вернуться к сегодня
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => goToMonth(view.year, view.month + 1)}
          aria-label="Следующий месяц"
          className="-mr-2 flex size-11 items-center justify-center text-text-muted active:text-accent"
        >
          <ChevronRight size={22} aria-hidden />
        </button>
      </header>

      <div className="mt-3 grid grid-cols-7 gap-1">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="pb-1 text-center text-[11px] tracking-wide text-text-faint uppercase"
          >
            {day}
          </div>
        ))}

        {grid.map((day) => (
          <DayCell
            key={day}
            day={day}
            events={byDay.get(day) ?? []}
            inMonth={parseDay(day).month === view.month}
            isToday={day === todayKey}
            isSelected={day === selected}
            onSelect={selectDay}
          />
        ))}
      </div>

      <section className="mt-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-display text-[17px] text-text">
            {longDate(selected)}
          </h2>
          <button
            type="button"
            onClick={() => setComposerOpen(true)}
            className="flex shrink-0 items-center gap-1 text-[13px] text-accent"
          >
            <Plus size={15} aria-hidden />
            Добавить
          </button>
        </div>

        {dayEvents.length === 0 ? (
          <p className="mt-3 text-[14px] leading-relaxed text-text-faint">
            В этот день ничего не отмечено.
          </p>
        ) : (
          <ul className="mt-3 space-y-2.5">
            {dayEvents.map((event) => (
              <EventCard key={`${event.kind}-${event.id}`} event={event} />
            ))}
          </ul>
        )}
      </section>

      <EventComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        day={selected}
      />
    </div>
  );
}

function DayCell({
  day,
  events,
  inMonth,
  isToday,
  isSelected,
  onSelect,
}: {
  day: string;
  events: CalendarEvent[];
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  onSelect: (day: string) => void;
}) {
  const number = parseDay(day).day;

  return (
    <button
      type="button"
      onClick={() => onSelect(day)}
      aria-pressed={isSelected}
      aria-label={`${longDate(day)}${
        events.length > 0 ? `, событий: ${events.length}` : ""
      }`}
      className={cn(
        // Высота под палец: меньше 44 точек Apple не рекомендует.
        "flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl",
        "text-[15px] transition-colors duration-100",
        isSelected
          ? "bg-accent font-medium text-on-accent"
          : isToday
            ? "border border-accent/60 text-accent"
            : inMonth
              ? "text-text active:bg-surface-2"
              : "text-text-faint/45",
      )}
    >
      <span className="leading-none">{number}</span>

      <span className="flex h-1 items-center gap-[3px]">
        {events.slice(0, 3).map((event, i) => (
          <span
            key={i}
            className={cn(
              "size-1 rounded-full",
              isSelected
                ? "bg-on-accent/70"
                : event.kind === "date"
                  ? "bg-accent-2"
                  : "bg-accent",
            )}
          />
        ))}
      </span>
    </button>
  );
}

function EventCard({ event }: { event: CalendarEvent }) {
  return (
    <li className="rounded-3xl border border-border bg-surface/92 p-4 shadow-card">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium text-text">
            {event.emoji && <span className="mr-1.5">{event.emoji}</span>}
            {event.title}
          </p>

          <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-accent">
            {event.time && <span>{event.time}</span>}

            {event.recurring && (
              <span className="flex items-center gap-1 text-text-muted">
                <Repeat size={12} aria-hidden />
                каждый год
              </span>
            )}

            {event.yearsOn !== null && (
              <span className="text-accent-2">
                исполняется {event.yearsOn} {plural(event.yearsOn, units.year)}
              </span>
            )}
          </p>

          {event.location && (
            <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-text-muted">
              <MapPin size={13} aria-hidden />
              {event.location}
            </p>
          )}

          {event.description && (
            <p className="mt-2 text-[14px] leading-relaxed text-text-muted">
              {event.description}
            </p>
          )}
        </div>

        <DeleteEvent id={event.id} kind={event.kind} title={event.title} />
      </div>
    </li>
  );
}
