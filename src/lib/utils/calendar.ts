/**
 * Раскладка месяца и разбор событий по дням.
 *
 * Здесь только вычисления над готовыми строками вида «2026-03-04».
 *
 * Сами дни считаются один раз на сервере, в часовом поясе пары, и приходят
 * сюда уже посчитанными. Иначе сервер (он живёт по Гринвичу) и телефон
 * посчитали бы вечернее событие разными днями, и страница при загрузке
 * мигнула бы, перерисовавшись под браузер.
 */

/** План или дата, у которых день уже приведён к поясу пары. */
export type CalendarItem = {
  id: string;
  /** plan — разовое событие, date — повторяющаяся дата вроде дня рождения. */
  kind: "plan" | "date";
  title: string;
  emoji: string | null;
  /** «2026-03-04» */
  day: string;
  /** «19:30» либо null, если событие на весь день. */
  time: string | null;
  location: string | null;
  description: string | null;
  /** Повторять каждый год. */
  recurring: boolean;
};

/** То же событие, но привязанное к конкретному дню на экране. */
export type CalendarEvent = CalendarItem & {
  /**
   * Сколько исполняется в этот раз. Есть только у повторяющихся дат
   * с годом в прошлом: день рождения 1975 года в 2026-м подпишется
   * как «51 год».
   */
  yearsOn: number | null;
};

export const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as const;

const MONTHS = [
  "январь",
  "февраль",
  "март",
  "апрель",
  "май",
  "июнь",
  "июль",
  "август",
  "сентябрь",
  "октябрь",
  "ноябрь",
  "декабрь",
] as const;

const MONTHS_OF = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
] as const;

/** «YYYY-MM-DD» из частей. */
export function makeDay(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Год, месяц, день и время момента в заданном часовом поясе.
 *
 * Через formatToParts, а не через готовую строку: порядок частей в разных
 * языках разный, а здесь нужны именно числа.
 */
function partsIn(date: Date, timeZone: string) {
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts: Record<string, string> = {};
  for (const part of format.formatToParts(date)) parts[part.type] = part.value;

  // Полночь в некоторых сборках ICU приходит как 24 часа, а не как 0.
  const hour = parts.hour === "24" ? "00" : parts.hour;

  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${hour}:${parts.minute}`,
  };
}

/** Число и время, на которые приходится момент в заданном поясе. */
export function momentIn(date: Date, timeZone: string) {
  return partsIn(date, timeZone);
}

/** Число, на которое приходится момент в заданном поясе. */
export function dayIn(date: Date, timeZone: string): string {
  return partsIn(date, timeZone).day;
}

/** Сегодняшнее число по календарю пары, а не по часам сервера. */
export function todayIn(timeZone: string): string {
  return partsIn(new Date(), timeZone).day;
}

/** Часовой пояс пары, с запасным вариантом на случай кривого значения. */
export function safeZone(timezone: string | null | undefined): string {
  const value = timezone?.trim();
  if (!value) return "UTC";

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return value;
  } catch {
    return "UTC";
  }
}

/**
 * Разбор «YYYY-MM-DD» по кускам строки, а не через new Date().
 *
 * new Date("2026-03-04") считает строку временем по Гринвичу и в минусовых
 * часовых поясах отдаёт третье марта. Для дней рождения это критично.
 */
export function parseDay(value: string): {
  year: number;
  month: number;
  day: number;
} {
  const [year, month, day] = value.split("-").map(Number);
  return { year, month: month - 1, day };
}

export function monthTitle(year: number, month: number): string {
  return `${MONTHS[month]} ${year}`;
}

/** «4 марта 2026» — для заголовка выбранного дня. */
export function longDate(value: string): string {
  const { year, month, day } = parseDay(value);
  return `${day} ${MONTHS_OF[month]} ${year}`;
}

/** «4 марта» — там, где год и так понятен, например на плитке главной. */
export function shortDate(value: string): string {
  const { month, day } = parseDay(value);
  return `${day} ${MONTHS_OF[month]}`;
}

/**
 * Дни сетки месяца: с понедельника недели, куда попало первое число,
 * и до конца недели с последним.
 *
 * Дата собирается из частей и обратно в части же и читается, поэтому
 * часовой пояс на результат не влияет.
 */
export function monthGrid(year: number, month: number): string[] {
  const first = new Date(year, month, 1);
  // getDay() считает воскресенье нулём, а неделя у нас начинается с понедельника.
  const shift = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Math.ceil((shift + daysInMonth) / 7) * 7;

  return Array.from({ length: cells }, (_, i) => {
    const d = new Date(year, month, 1 - shift + i);
    return makeDay(d.getFullYear(), d.getMonth(), d.getDate());
  });
}

/**
 * События месяца, разложенные по дням.
 *
 * Повторяющиеся даты хранятся одной строкой на всё время, а не по строке
 * на каждый год: сюда они попадают в тот год, который сейчас на экране.
 */
export function eventsForMonth(
  items: CalendarItem[],
  year: number,
  month: number,
): Map<string, CalendarEvent[]> {
  const byDay = new Map<string, CalendarEvent[]>();

  const push = (key: string, event: CalendarEvent) => {
    const list = byDay.get(key);
    if (list) list.push(event);
    else byDay.set(key, [event]);
  };

  for (const item of items) {
    const parsed = parseDay(item.day);

    if (!item.recurring) {
      if (parsed.year === year && parsed.month === month) {
        push(item.day, { ...item, yearsOn: null });
      }
      continue;
    }

    if (parsed.month !== month) continue;

    // Тридцать первого февраля не бывает: если такого числа в этом году
    // нет, отмечаем последний день месяца, а не первое число следующего.
    const lastDay = new Date(year, month + 1, 0).getDate();
    const years = year - parsed.year;

    push(makeDay(year, month, Math.min(parsed.day, lastDay)), {
      ...item,
      yearsOn: years > 0 ? years : null,
    });
  }

  // Внутри дня: сперва то, что на весь день, потом события по часам.
  for (const list of byDay.values()) {
    list.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
  }

  return byDay;
}

/**
 * Ближайшее событие начиная с сегодняшнего дня — для плитки на главной.
 * Повторяющаяся дата примеряется к этому году, а если день уже прошёл —
 * к следующему.
 */
export function nextEvent(
  items: CalendarItem[],
  todayKey: string,
): { day: string; title: string } | null {
  const today = parseDay(todayKey);
  let best: { day: string; title: string } | null = null;

  const consider = (day: string, title: string) => {
    if (day < todayKey) return;
    if (!best || day < best.day) best = { day, title };
  };

  for (const item of items) {
    const parsed = parseDay(item.day);
    const label = item.emoji ? `${item.emoji} ${item.title}` : item.title;

    if (!item.recurring) {
      consider(item.day, label);
      continue;
    }

    for (const year of [today.year, today.year + 1]) {
      const lastDay = new Date(year, parsed.month + 1, 0).getDate();
      consider(
        makeDay(year, parsed.month, Math.min(parsed.day, lastDay)),
        label,
      );
    }
  }

  return best;
}
