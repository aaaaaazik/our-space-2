import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createViewUrl } from "@/lib/storage/r2";
import { longDate } from "@/lib/utils/calendar";
import { chooseMemory, type MemoryCandidate } from "@/lib/utils/memory";
import type { Database, MediaKind } from "@/types/database";

type Client = SupabaseClient<Database>;

/** Насколько далеко назад вообще смотрим. */
const YEARS_BACK = 12;

/**
 * Окно вокруг сегодняшнего числа, в днях.
 *
 * Ровно в это число снимок находится не всегда, а карточка, которая
 * появляется раз в месяц, забывается. Плюс-минус несколько дней — это
 * всё ещё «тогда же», и подпись про это честно говорит.
 */
const WINDOW_DAYS = 4;

/** Строка из базы: берём только то, что нужно для карточки. */
type Row = MemoryCandidate & {
  id: string;
  album_id: string | null;
  title: string | null;
};

export type DayMemory = {
  url: string;
  kind: MediaKind;
  title: string | null;
  albumId: string | null;
  /** Сколько лет назад это снято. */
  yearsAgo: number;
  /** Ровно в это число — или всё-таки в соседние. */
  exact: boolean;
  /** «17 августа 2025» */
  when: string;
};

/**
 * Запрос за снимками прошлых лет, снятыми примерно в этот же день.
 *
 * Уходит в общей волне запросов главной, поэтому часовой пояс пары здесь
 * ещё не известен — окно строится по часам сервера. Ошибиться на пять
 * часов оно не боится: окно и так шире недели, а точное «то самое число»
 * определяется потом, когда пояс уже есть.
 */
export function memoryQuery(supabase: Client, now: Date) {
  const year = now.getUTCFullYear();
  const ranges: string[] = [];

  for (let y = year - YEARS_BACK; y < year; y++) {
    // Дата собирается заново для каждого года, поэтому окно само
    // переползает через границу месяца и года: для второго января
    // оно захватит конец декабря.
    const centre = Date.UTC(y, now.getUTCMonth(), now.getUTCDate());
    const from = new Date(centre - WINDOW_DAYS * 86_400_000);
    const to = new Date(centre + (WINDOW_DAYS + 1) * 86_400_000 - 1);

    ranges.push(
      `and(taken_at.gte.${from.toISOString()},taken_at.lte.${to.toISOString()})`,
    );
  }

  return supabase
    .from("photos")
    .select("id, album_id, storage_path, poster_path, kind, title, taken_at")
    .or(ranges.join(","))
    .order("taken_at", { ascending: false });
}

/** Выбирает снимок и выписывает на него временную ссылку. */
export async function pickMemory(
  rows: unknown,
  todayKey: string,
  timeZone: string,
): Promise<DayMemory | null> {
  const chosen = chooseMemory(
    (rows as Row[] | null) ?? [],
    todayKey,
    timeZone,
  );

  if (!chosen) return null;

  let url: string;
  try {
    url = await createViewUrl(chosen.key);
  } catch {
    // Хранилище недоступно — карточку просто не показываем.
    // Ронять из-за неё всю главную нельзя.
    return null;
  }

  return {
    url,
    kind: chosen.row.kind,
    title: chosen.row.title,
    albumId: chosen.row.album_id,
    yearsAgo: chosen.yearsAgo,
    exact: chosen.exact,
    when: longDate(chosen.day),
  };
}
