"use server";

import { revalidatePath } from "next/cache";

import { scoreAnswers } from "@/lib/games/loveLanguages";
import { notifyPartner } from "@/lib/push/send";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; ok?: boolean };

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function refresh() {
  revalidatePath("/games", "layout");
  revalidatePath("/");
}

/** Развёрнутый ответ — вопрос дня и любые текстовые вопросы. */
export async function answerWithText(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Сессия истекла. Войдите заново." };

  const questionId = String(formData.get("question_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();

  if (!questionId) return { error: "Вопрос не найден." };
  if (!body) return { error: "Напишите ответ." };
  if (body.length > 2000) return { error: "Слишком длинный ответ." };

  // Передумал — заменяем свой прежний ответ, а не плодим новые.
  const { error } = await supabase
    .from("answers")
    .upsert(
      { question_id: questionId, author_id: user.id, body },
      { onConflict: "question_id,author_id" },
    );

  if (error) return { error: "Не удалось сохранить ответ." };

  // Текст ответа не показываем: второй должен сначала ответить сам.
  await notifyPartner(supabase, "daily", {
    title: "Ответ на вопрос дня готов 💬",
    body: "Ответь сама — и увидишь, что написали тебе",
    url: "/games/daily",
  });

  refresh();
  return { ok: true };
}

/** Свой вопрос в набор. */
export async function addQuestion(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Сессия истекла." };

  const packId = String(formData.get("pack_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();

  if (!packId) return { error: "Набор не найден." };
  if (body.length < 3) return { error: "Вопрос слишком короткий." };
  if (body.length > 500) return { error: "Вопрос слишком длинный." };

  // Ставим в конец: узнаём последний номер в наборе.
  const { data: last } = await supabase
    .from("questions")
    .select("position")
    .eq("pack_id", packId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("questions").insert({
    pack_id: packId,
    body,
    position: (last?.position ?? 0) + 1,
    created_by: user.id,
  });

  if (error) return { error: "Не удалось добавить вопрос." };

  refresh();
  return { ok: true };
}

/**
 * Сохраняет прогресс теста «языки любви».
 *
 * Ответы уходят целиком на каждом шаге, а не по одному: список короткий,
 * зато можно закрыть приложение посреди теста и вернуться туда же.
 */
export async function saveLoveAnswers(
  answers: Record<string, "a" | "b">,
  total: number,
): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Сессия истекла." };

  const entries = Object.entries(answers).filter(
    ([index, choice]) =>
      Number.isInteger(Number(index)) &&
      Number(index) >= 0 &&
      Number(index) < total &&
      (choice === "a" || choice === "b"),
  );

  const clean = Object.fromEntries(entries) as Record<string, "a" | "b">;
  const done = entries.length >= total;

  const { error } = await supabase.from("love_results").upsert(
    {
      user_id: user.id,
      answers: clean,
      scores: scoreAnswers(clean),
      // Пока тест не пройден до конца, результат второго не откроется:
      // это проверяет функция has_love_result в самой базе.
      completed_at: done ? new Date().toISOString() : null,
    },
    { onConflict: "user_id" },
  );

  if (error) return { error: "Не удалось сохранить ответы." };

  revalidatePath("/games/love");
  revalidatePath("/games");
  return {};
}

export async function resetLoveResult(): Promise<void> {
  const { supabase, user } = await requireUser();
  if (!user) return;

  await supabase.from("love_results").delete().eq("user_id", user.id);

  revalidatePath("/games/love");
  revalidatePath("/games");
}

/**
 * Тихая строчка к ответу второго — как заметка к желанию.
 *
 * Пишет её тот, кто ответ не писал. Проверки — в функции базы: политика
 * таблицы разрешает менять только свои ответы, а работать с отдельными
 * столбцами она не умеет.
 */
export async function setAnswerNote(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Сессия истекла. Войдите заново." };

  const id = String(formData.get("id") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  if (!id) return { error: "Ответ не найден." };
  if (note.length > 200) return { error: "Слишком длинно." };

  const { error } = await supabase.rpc("set_answer_note", {
    p_answer: id,
    p_note: note || null,
  });

  if (error) return { error: "Не удалось сохранить заметку." };

  refresh();
  return { ok: true };
}

export async function deleteQuestion(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { supabase } = await requireUser();
  // Встроенные вопросы созданы без автора, поэтому политика их не отдаст.
  await supabase.from("questions").delete().eq("id", id);

  refresh();
}
