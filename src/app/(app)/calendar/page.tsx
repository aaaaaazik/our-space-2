import type { Metadata } from "next";

import { CalendarView } from "@/components/calendar/CalendarView";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  datesQuery,
  plansQuery,
  safeZone,
  todayIn,
  toCalendarItems,
} from "@/lib/data/calendar";
import { asSettings, requireSession, settingsQuery } from "@/lib/data/couple";

export const metadata: Metadata = { title: "Календарь" };

export default async function CalendarPage() {
  const { supabase } = await requireSession();

  const [settingsResult, plansResult, datesResult] = await Promise.all([
    settingsQuery(supabase),
    plansQuery(supabase),
    datesQuery(supabase),
  ]);

  // Часовой пояс берём общий, из настроек пары, а не из браузера: иначе
  // в поездке события съезжали бы на соседние числа. Сервер живёт по
  // Гринвичу, поэтому день считается здесь и уходит на страницу готовым.
  const zone = safeZone(asSettings(settingsResult).timezone);

  return (
    <div>
      <PageHeader
        title="Календарь"
        subtitle="Нажмите на число, чтобы посмотреть или добавить"
      />

      <CalendarView
        items={toCalendarItems(plansResult.data, datesResult.data, zone)}
        todayKey={todayIn(zone)}
      />
    </div>
  );
}
