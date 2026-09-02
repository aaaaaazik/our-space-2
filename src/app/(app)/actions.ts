"use server";

import { notifyPartner } from "@/lib/push/send";
import { createClient } from "@/lib/supabase/server";

export type ThoughtState = { error?: string; ok?: boolean };

/**
 * Чтобы уведомление не приедалось. Все варианты в третьем лице —
 * они одинаково верны и про неё, и про него.
 */
const LINES = [
  "Просто так, без повода",
  "Прямо сейчас",
  "И улыбается",
  "Ни с того ни с сего",
  "Вот прямо в эту минуту",
];

/**
 * Нажатие кнопки «думаю о тебе».
 *
 * Ограничения по частоте нет намеренно: захотелось нажать десять раз
 * подряд — значит, так и надо. Страница после отправки не перезагружается,
 * иначе каждое нажатие подвешивало бы главную на полсекунды.
 */
export async function sendThought(): Promise<ThoughtState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Сессия истекла. Войдите заново." };

  const [insertResult, profileResult] = await Promise.all([
    supabase.from("thoughts").insert({ author_id: user.id }),
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  if (insertResult.error) return { error: "Не удалось отправить." };

  const name = profileResult.data?.display_name ?? "Твоя половинка";

  // Настоящее время: уведомление приходит в ту же секунду, когда нажали,
  // — «думает» здесь и точнее, и живее прошедшего. На главной та же
  // мысль показывается уже задним числом и там стоит «думала».
  await notifyPartner(supabase, "thoughts", {
    title: `${name} думает о тебе 💜`,
    body: LINES[Math.floor(Math.random() * LINES.length)],
    url: "/",
    // Короткий двойной толчок — как стук в дверь. На айфоне не работает,
    // подробности в комментарии к типу PushMessage.
    vibrate: [80, 60, 80],
  });

  return { ok: true };
}
