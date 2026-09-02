import type { SupabaseClient } from "@supabase/supabase-js";

import { momentIn, type CalendarItem } from "@/lib/utils/calendar";
import type { Database, ImportantDate, Plan } from "@/types/database";

// Часовые пояса и разбор дат живут в lib/utils/calendar — они чистые
// и нужны в том числе в браузере. Здесь остаётся только работа с базой.
export { dayIn, safeZone, todayIn } from "@/lib/utils/calendar";

type Client = SupabaseClient<Database>;

/*
  Календарь забирает обе таблицы целиком.

  За годы там наберётся пара сотен строк — это меньше, чем весит одна
  фотография, — зато перелистывание месяцев не ходит в сеть вообще.
*/
export function plansQuery(supabase: Client) {
  return supabase.from("plans").select("*").order("starts_at");
}

export function datesQuery(supabase: Client) {
  return supabase.from("important_dates").select("*").order("date");
}

/**
 * Строки двух таблиц — в один список для календаря.
 *
 * У планов время хранится моментом на шкале, поэтому день считается здесь,
 * в поясе пары. У важных дат в базе лежит просто число без времени —
 * его брать как есть, иначе день рождения переедет на соседнее число.
 */
export function toCalendarItems(
  planRows: unknown,
  dateRows: unknown,
  timeZone: string,
): CalendarItem[] {
  const plans = (planRows as Plan[] | null) ?? [];
  const dates = (dateRows as ImportantDate[] | null) ?? [];

  const items: CalendarItem[] = plans.map((plan) => {
    const { day, time } = momentIn(new Date(plan.starts_at), timeZone);

    return {
      id: plan.id,
      kind: "plan",
      title: plan.title,
      emoji: null,
      day,
      time: plan.all_day ? null : time,
      location: plan.location,
      description: plan.description,
      recurring: false,
    };
  });

  for (const date of dates) {
    items.push({
      id: date.id,
      kind: "date",
      title: date.label,
      emoji: date.emoji,
      day: date.date,
      time: null,
      location: null,
      description: null,
      recurring: date.is_recurring,
    });
  }

  return items;
}
