/**
 * Выбор снимка для «воспоминания дня».
 *
 * Здесь только правило выбора, без базы и без хранилища: так его можно
 * прогнать отдельно и убедиться, что на границе года и в високосный
 * февраль оно ведёт себя как задумано.
 */

import { dayIn, parseDay } from "@/lib/utils/calendar";

/** То немногое, что нужно от строки таблицы, чтобы сделать выбор. */
export type MemoryCandidate = {
  storage_path: string;
  poster_path: string | null;
  kind: "photo" | "video";
  taken_at: string;
};

export type ChosenMemory<T extends MemoryCandidate> = {
  row: T;
  /** Что именно показывать: сам снимок или кадр-обложку видео. */
  key: string;
  yearsAgo: number;
  /** Ровно в это число — или всё-таки в соседние. */
  exact: boolean;
  /** «2025-08-17» — когда это снято, по календарю пары. */
  day: string;
};

/**
 * Один снимок из тех, что нашлись.
 *
 * Порядок предпочтений: сперва попавшие ровно в это число, потом самые
 * недавние. Если подходящих несколько, номер считается из сегодняшней
 * даты — за день карточка не меняется, сколько бы раз ни открыли
 * страницу, а завтра покажется другая.
 */
export function chooseMemory<T extends MemoryCandidate>(
  rows: T[],
  todayKey: string,
  timeZone: string,
): ChosenMemory<T> | null {
  const today = parseDay(todayKey);

  const candidates = rows
    .map((row) => {
      // У видео без кадра-обложки показывать нечего: сам файл в карточку
      // не поставишь — он тяжёлый и не проигрывается сам.
      const key = row.kind === "video" ? row.poster_path : row.storage_path;
      if (!key) return null;

      const day = dayIn(new Date(row.taken_at), timeZone);
      const taken = parseDay(day);
      const yearsAgo = today.year - taken.year;

      // Окно запроса шире года и может зацепить позавчерашний снимок.
      // Воспоминание — это про прошлые годы, а не про эту неделю.
      if (yearsAgo < 1) return null;

      return {
        row,
        key,
        day,
        yearsAgo,
        exact: taken.month === today.month && taken.day === today.day,
      };
    })
    .filter((candidate) => candidate !== null);

  if (candidates.length === 0) return null;

  // Чем меньше оценка, тем лучше. Совпадение по числу важнее свежести,
  // поэтому оно стоит в старшем разряде и никакой разницей в годах
  // не перебивается.
  const score = (c: { exact: boolean; yearsAgo: number }) =>
    (c.exact ? 0 : 1000) + c.yearsAgo;

  const best = Math.min(...candidates.map(score));
  const group = candidates.filter((c) => score(c) === best);

  const daysSinceEpoch = Math.floor(
    Date.UTC(today.year, today.month, today.day) / 86_400_000,
  );

  return group[daysSinceEpoch % group.length];
}
