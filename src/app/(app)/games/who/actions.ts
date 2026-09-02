"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { notifyPartner } from "@/lib/push/send";
import { createClient } from "@/lib/supabase/server";

export type WhoState = { error?: string; ok?: boolean };

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function refresh() {
  revalidatePath("/games/who");
  revalidatePath("/games");
}

/**
 * Ответ на утверждение: показать на одного из двоих.
 *
 * Передаётся именно тот, на кого показали, а не «я» или «ты». Из-за этого
 * совпадение потом считается простым равенством: «я» одного и «ты»
 * второго — это один и тот же человек.
 */
export async function answerWho(
  statementId: string,
  pick: string,
): Promise<WhoState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Сессия истекла. Войдите заново." };

  if (!statementId || !pick) return { error: "Не выбрано, на кого показать." };

  // Передумать можно — заменяем свой прежний ответ, а не плодим новые.
  const { error } = await supabase
    .from("who_answers")
    .upsert(
      { statement_id: statementId, author_id: user.id, pick },
      { onConflict: "statement_id,author_id" },
    );

  if (error) return { error: "Не удалось сохранить ответ." };

  // Уведомление уходит после ответа: обращение к службам Apple и Google
  // занимает полсекунды, и держать из-за него нажатие незачем.
  after(async () => {
    await notifyPartner(supabase, "games", {
      title: "Кто из нас? 🙋",
      body: "Ответь тоже — и увидишь, сошлись ли вы",
      url: "/games/who",
    });
  });

  refresh();
  return { ok: true };
}

/** Своё утверждение в общий набор. */
export async function addStatement(
  _prev: WhoState,
  formData: FormData,
): Promise<WhoState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Сессия истекла. Войдите заново." };

  const body = String(formData.get("body") ?? "").trim();

  if (body.length < 3) return { error: "Слишком коротко." };
  if (body.length > 200) return { error: "Слишком длинно." };

  const { error } = await supabase
    .from("who_statements")
    .insert({ body, created_by: user.id });

  if (error) return { error: "Не удалось добавить." };

  refresh();
  return { ok: true };
}

export async function deleteStatement(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { supabase } = await requireUser();
  // Встроенные созданы без автора, поэтому политика их не отдаст на удаление.
  await supabase.from("who_statements").delete().eq("id", id);

  refresh();
}
