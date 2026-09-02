"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { DRAWING_PROMPTS } from "@/lib/games/drawingPrompts";
import { notifyPartner } from "@/lib/push/send";
import { createUploadUrl, deleteObjects } from "@/lib/storage/r2";
import { createClient } from "@/lib/supabase/server";
import type { DrawingRound } from "@/types/database";

export type FormState = { error?: string; ok?: boolean };

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function refresh() {
  revalidatePath("/games/draw", "layout");
  revalidatePath("/games");
}

/** Временная ссылка, по которой браузер зальёт рисунок прямо в хранилище. */
export async function requestDrawingUpload(): Promise<
  { key: string; url: string } | { error: string }
> {
  const { user } = await requireUser();
  if (!user) return { error: "Сессия истекла. Войдите заново." };

  const key = `${user.id}/drawings/${crypto.randomUUID()}.png`;

  try {
    return { key, url: await createUploadUrl(key, "image/png") };
  } catch (error) {
    console.error("drawing upload url failed:", error);
    return {
      error:
        error instanceof Error
          ? `Хранилище не настроено: ${error.message}`
          : "Хранилище недоступно.",
    };
  }
}

/**
 * Создаёт раунд после того, как рисунок уже залит.
 * Задание кладём отдельной строкой — его нельзя показывать угадывающему,
 * а скрыть отдельный столбец правила доступа не умеют.
 */
export async function createRound(input: {
  key: string;
  prompt: string;
}): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Сессия истекла." };

  // Задание либо из нашего списка, либо своё — но тогда с ограничением
  // длины: через это поле в базу иначе можно записать что угодно.
  const prompt = input.prompt.trim();
  const known = DRAWING_PROMPTS.includes(
    prompt as (typeof DRAWING_PROMPTS)[number],
  );

  if (!known) {
    if (prompt.length < 2) return { error: "Слово слишком короткое." };
    if (prompt.length > 40) return { error: "Слово слишком длинное." };
  }

  if (!input.key.startsWith(`${user.id}/drawings/`)) {
    return { error: "Некорректный файл." };
  }

  const { data: round, error } = await supabase
    .from("drawing_rounds")
    .insert({ author_id: user.id, storage_path: input.key })
    .select("id")
    .single();

  if (error || !round) {
    await deleteObjects([input.key]);
    return { error: "Не удалось сохранить рисунок." };
  }

  const { error: secretError } = await supabase
    .from("drawing_secrets")
    .insert({ round_id: round.id, prompt });

  if (secretError) {
    // Раунд без задания бесполезен — убираем и его, и файл.
    await supabase.from("drawing_rounds").delete().eq("id", round.id);
    await deleteObjects([input.key]);
    return { error: "Не удалось сохранить задание." };
  }

  await notifyPartner(supabase, "games", {
    title: "Твоя очередь угадывать 🎨",
    body: "Новый рисунок ждёт разгадки",
    url: `/games/draw/${round.id}`,
  });

  refresh();
  return {};
}

/** Догадка второго игрока. */
export async function submitGuess(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Сессия истекла." };

  const roundId = String(formData.get("round_id") ?? "");
  const guess = String(formData.get("guess") ?? "").trim();

  if (!roundId) return { error: "Раунд не найден." };
  if (!guess) return { error: "Напишите догадку." };
  if (guess.length > 200) return { error: "Слишком длинно." };

  const { data: round } = await supabase
    .from("drawing_rounds")
    .select("author_id, guess")
    .eq("id", roundId)
    .maybeSingle();

  const existing = round as Pick<DrawingRound, "author_id" | "guess"> | null;

  if (!existing) return { error: "Раунд не найден." };
  if (existing.author_id === user.id) {
    return { error: "Свой рисунок угадывать не нужно." };
  }
  if (existing.guess) return { error: "Ответ уже принят." };

  const { error } = await supabase
    .from("drawing_rounds")
    .update({
      guess,
      guessed_by: user.id,
      guessed_at: new Date().toISOString(),
    })
    .eq("id", roundId)
    // Защита от гонки: если ответ успели записать между чтением и записью,
    // условие не совпадёт и второй ответ не затрёт первый.
    .is("guess", null);

  if (error) return { error: "Не удалось отправить ответ." };

  await notifyPartner(supabase, "games", {
    title: "Есть догадка 🤔",
    body: `Ответ: «${guess}». Засчитываем?`,
    url: `/games/draw/${roundId}`,
  });

  refresh();
  return { ok: true };
}

/** Автор решает, засчитать догадку или нет. */
export async function judgeGuess(formData: FormData): Promise<void> {
  const { supabase, user } = await requireUser();
  if (!user) return;

  const roundId = String(formData.get("round_id") ?? "");
  const correct = String(formData.get("correct") ?? "") === "1";
  if (!roundId) return;

  await supabase
    .from("drawing_rounds")
    .update({ is_correct: correct })
    .eq("id", roundId)
    // Засчитывает только автор.
    .eq("author_id", user.id);

  // Уведомление о засчитанном ответе намеренно не шлём: на один раунд
  // приходилось три штуки, и это превращалось в спам. Результат человек
  // увидит, когда откроет игру сам.

  refresh();
}

export async function deleteRound(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { supabase, user } = await requireUser();
  if (!user) return;

  const { data: round } = await supabase
    .from("drawing_rounds")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle();

  const { data: deleted } = await supabase
    .from("drawing_rounds")
    .delete()
    .eq("id", id)
    .select("id");

  // Удалить чужой раунд не даст политика доступа — тогда и файл не трогаем.
  if (deleted && deleted.length > 0 && round?.storage_path) {
    await deleteObjects([round.storage_path]);
  }

  refresh();
  redirect("/games/draw");
}


/* ============================================================================
   Режим «Заказ»

   Задание придумывает заказчик и не прячет его: рисующему без задания
   не обойтись. Поэтому отдельной таблицы для секрета здесь нет, а всё
   хранится одной строкой в drawing_orders.
   ========================================================================= */

/** Заказ: что нарисовать второму. */
export async function createOrder(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Сессия истекла. Войдите заново." };

  const task = String(formData.get("task") ?? "").trim();

  if (task.length < 2) return { error: "Напишите, что нарисовать." };
  if (task.length > 200) return { error: "Слишком длинное задание." };

  const { error } = await supabase
    .from("drawing_orders")
    .insert({ ordered_by: user.id, task });

  if (error) return { error: "Не удалось отправить заказ." };

  await notifyPartner(supabase, "games", {
    title: "Для тебя заказ 🎨",
    body: task,
    url: "/games/draw",
  });

  refresh();
  return { ok: true };
}

/** Рисунок по заказу. Файл уже залит, сюда приходит только его ключ. */
export async function submitOrderDrawing(
  orderId: string,
  key: string,
): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Сессия истекла." };

  const { error } = await supabase.rpc("submit_order_drawing", {
    order_id: orderId,
    key,
  });

  if (error) return { error: "Не удалось отправить рисунок." };

  await notifyPartner(supabase, "games", {
    title: "Заказ готов 🎨",
    body: "Посмотрите, что получилось, и поставьте оценку",
    url: "/games/draw",
  });

  refresh();
  return {};
}

/** Оценка от 1 до 10. Ставит заказчик, и только один раз. */
export async function scoreOrder(
  orderId: string,
  value: number,
): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Сессия истекла." };

  if (!Number.isInteger(value) || value < 1 || value > 10) {
    return { error: "Оценка от 1 до 10." };
  }

  const { error } = await supabase.rpc("score_order", {
    order_id: orderId,
    value,
  });

  if (error) return { error: "Не удалось поставить оценку." };

  await notifyPartner(supabase, "games", {
    title: `Оценка ${value} из 10 🎨`,
    body: "Ваш рисунок оценили",
    url: "/games/draw",
  });

  refresh();
  return {};
}

export async function deleteOrder(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { supabase } = await requireUser();

  // Ключ читаем до удаления строки: потом его будет неоткуда взять,
  // и файл остался бы висеть в хранилище навсегда.
  const { data: order } = await supabase
    .from("drawing_orders")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("drawing_orders")
    .delete()
    .eq("id", id);

  if (!error && order?.storage_path) {
    await deleteObjects([order.storage_path]).catch(() => {});
  }

  refresh();
}
