import { createClient } from "@supabase/supabase-js";

import { pushTo, type PushMessage } from "@/lib/push/send";
import { units, withUnit } from "@/lib/utils/plural";
import type {
  CoupleSettings,
  Database,
  DiaryEntry,
  ImportantDate,
  Plan,
} from "@/types/database";

/**
 * Ежедневная проверка: что напомнить сегодня.
 *
 * Запускается расписанием Vercel раз в сутки (см. vercel.json). На бесплатном
 * тарифе чаще нельзя, и точность ±59 минут — поэтому здесь только то, что
 * не требует минутной точности: годовщины, ближайшие даты и записи,
 * у которых наступил срок открытия.
 *
 * Мгновенные уведомления (фото, дневник, ход в игре) расписания не ждут —
 * они отправляются сразу из действий приложения.
 *
 * Здесь нет пользователя, а значит нет и его прав доступа. Поэтому нужен
 * служебный ключ Supabase: обычный публичный ключ ничего бы не увидел.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Сравнение дат без учёта года — для годовщин и дней рождения. */
function daysUntilAnniversary(date: Date, today: Date): number {
  const next = new Date(
    today.getFullYear(),
    date.getMonth(),
    date.getDate(),
    12,
  );
  if (next < today) next.setFullYear(today.getFullYear() + 1);

  return Math.round(
    (next.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12).getTime()) /
      86_400_000,
  );
}

/** «3 года» — сколько исполняется в эту годовщину. */
function yearsOn(start: Date, today: Date): number {
  const next = new Date(today.getFullYear(), start.getMonth(), start.getDate(), 12);
  if (next < today) next.setFullYear(today.getFullYear() + 1);
  return next.getFullYear() - start.getFullYear();
}

export async function GET(request: Request) {
  // Vercel подписывает свои вызовы. Без проверки любой мог бы дёргать
  // этот адрес и слать вам уведомления.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = request.headers.get("authorization");
    if (header !== `Bearer ${secret}`) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return Response.json(
      { error: "не заданы NEXT_PUBLIC_SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY" },
      { status: 500 },
    );
  }

  const supabase = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false },
  });

  const today = new Date();
  const messages: PushMessage[] = [];

  const [settingsResult, datesResult, plansResult, unlockedResult] =
    await Promise.all([
      supabase.from("couple_settings").select("*").maybeSingle(),
      supabase.from("important_dates").select("*"),
      supabase
        .from("plans")
        .select("*")
        .gte("starts_at", today.toISOString())
        .lte(
          "starts_at",
          new Date(today.getTime() + 2 * 86_400_000).toISOString(),
        ),
      // Записи, у которых срок открытия наступил за последние сутки.
      supabase
        .from("diary_entries")
        .select("*")
        .not("unlock_at", "is", null)
        .lte("unlock_at", today.toISOString())
        .gte(
          "unlock_at",
          new Date(today.getTime() - 86_400_000).toISOString(),
        ),
    ]);

  // --- Годовщина отношений --------------------------------------------------
  const settings = settingsResult.data as CoupleSettings | null;
  if (settings) {
    const start = new Date(settings.relationship_start);
    const days = daysUntilAnniversary(start, today);
    const years = yearsOn(start, today);

    if (days === 0) {
      messages.push({
        title: `Сегодня ${withUnit(years, units.year)} вместе ❤️`,
        body: "С годовщиной вас",
        url: "/",
      });
    } else if (days === 7 || days === 1) {
      messages.push({
        title: days === 1 ? "Завтра ваша годовщина 🎉" : "Через неделю годовщина 🎉",
        body: `Исполняется ${withUnit(years, units.year)}`,
        url: "/",
      });
    }
  }

  // --- Важные даты ----------------------------------------------------------
  for (const date of (datesResult.data as ImportantDate[] | null) ?? []) {
    const days = daysUntilAnniversary(new Date(date.date), today);
    if (days !== 0 && days !== 3) continue;

    messages.push({
      title: `${date.emoji ?? "📅"} ${date.label}`,
      body: days === 0 ? "Это сегодня" : "Через три дня",
      url: "/calendar",
    });
  }

  // --- Ближайшие планы ------------------------------------------------------
  for (const plan of (plansResult.data as Plan[] | null) ?? []) {
    const when = new Date(plan.starts_at);
    const isTomorrow =
      when.toDateString() ===
      new Date(today.getTime() + 86_400_000).toDateString();

    if (!isTomorrow) continue;

    messages.push({
      title: "Завтра у вас планы 📅",
      body: plan.title,
      url: "/calendar",
    });
  }

  // --- Открывшиеся записи ---------------------------------------------------
  const unlocked = (unlockedResult.data as DiaryEntry[] | null) ?? [];
  if (unlocked.length > 0) {
    messages.push({
      title: "Запись открылась 🔓",
      body:
        unlocked.length === 1
          ? "То, что было написано для тебя, теперь можно прочитать"
          : `Открылось записей: ${unlocked.length}`,
      url: "/diary",
    });
  }

  if (messages.length === 0) {
    return Response.json({ ok: true, sent: 0, reason: "нечего напоминать" });
  }

  // Здесь шлём обоим: годовщина и даты касаются пары целиком.
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth, user_id");

  const { data: prefs } = await supabase
    .from("notification_settings")
    .select("user_id, dates, diary");

  const targets = (
    (subs as Array<{
      endpoint: string;
      p256dh: string;
      auth: string;
      user_id: string;
    }> | null) ?? []
  ).filter((sub) => {
    const setting = (
      (prefs as Array<{ user_id: string; dates: boolean; diary: boolean }> | null) ??
      []
    ).find((p) => p.user_id === sub.user_id);
    // Нет настроек — считаем, что можно: по умолчанию всё включено.
    return setting ? setting.dates || setting.diary : true;
  });

  let sent = 0;
  for (const message of messages) {
    const result = await pushTo(targets, message, async (endpoint) => {
      await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
    });
    sent += result.sent;
  }

  return Response.json({ ok: true, messages: messages.length, sent });
}
