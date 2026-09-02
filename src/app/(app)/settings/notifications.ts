"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { pushTo } from "@/lib/push/send";

export type NotifyState = { error?: string; message?: string };

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Сохраняет адрес устройства, на который приходят уведомления. */
export async function saveSubscription(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Сессия истекла." };

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      user_agent: input.userAgent ?? null,
    },
    // Адрес уникален: одно устройство — одна строка. При повторном
    // разрешении просто обновляем ключи, а не плодим дубликаты.
    { onConflict: "endpoint" },
  );

  if (error) return { error: "Не удалось включить уведомления." };

  // Настройки могли не создаться, если человек появился позже миграции.
  await supabase
    .from("notification_settings")
    .upsert({ user_id: user.id }, { onConflict: "user_id" });

  revalidatePath("/settings");
  return {};
}

export async function removeSubscription(
  endpoint: string,
): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Сессия истекла." };

  await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("user_id", user.id);

  revalidatePath("/settings");
  return {};
}

/** Присылает уведомление самому себе — проверить, что всё работает. */
export async function sendTestNotification(): Promise<NotifyState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Сессия истекла." };

  const { data } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", user.id);

  const targets = (data as Array<{
    endpoint: string;
    p256dh: string;
    auth: string;
  }> | null) ?? [];

  if (targets.length === 0) {
    return { error: "Сначала включите уведомления на этом устройстве." };
  }

  const { sent } = await pushTo(
    targets,
    {
      title: "Проверка связи ❤️",
      body: "Если ты это видишь — уведомления работают.",
      url: "/",
    },
    async (endpoint) => {
      await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
    },
  );

  return sent > 0
    ? { message: "Отправлено. Уведомление должно прийти через пару секунд." }
    : { error: "Не удалось отправить. Проверьте ключи VAPID на сервере." };
}

/** Переключатели по типам уведомлений. */
export async function updateNotificationSettings(
  _prev: NotifyState,
  formData: FormData,
): Promise<NotifyState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Сессия истекла." };

  const flag = (name: string) => formData.get(name) === "on";

  const quietFrom = formData.get("quiet_from");
  const quietTo = formData.get("quiet_to");
  const quietEnabled = formData.get("quiet") === "on";

  const { error } = await supabase.from("notification_settings").upsert(
    {
      user_id: user.id,
      photos: flag("photos"),
      diary: flag("diary"),
      games: flag("games"),
      dates: flag("dates"),
      daily_question: flag("daily_question"),
      thoughts: flag("thoughts"),
      chat: flag("chat"),
      quiet_from: quietEnabled ? Number(quietFrom) : null,
      quiet_to: quietEnabled ? Number(quietTo) : null,
    },
    { onConflict: "user_id" },
  );

  if (error) return { error: "Не удалось сохранить." };

  revalidatePath("/settings");
  return { message: "Сохранено." };
}
