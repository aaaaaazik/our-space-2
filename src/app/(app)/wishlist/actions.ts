"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { WishStatus } from "@/types/database";

export type FormState = { error?: string; ok?: boolean };

const STATUSES: WishStatus[] = ["want", "planning", "soon", "done"];

export async function createWish(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Сессия истекла. Войдите заново." };

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Напишите, чего хочется." };

  const rawPrice = String(formData.get("price") ?? "").trim();
  const price = rawPrice ? Number(rawPrice.replace(",", ".")) : null;

  const { error } = await supabase.from("wishes").insert({
    created_by: user.id,
    title,
    description: String(formData.get("description") ?? "").trim() || null,
    category: String(formData.get("category") ?? "").trim() || null,
    price: price !== null && Number.isFinite(price) ? price : null,
    priority: Number(formData.get("priority") ?? 2) || 2,
  });

  if (error) return { error: "Не удалось сохранить желание." };

  revalidatePath("/wishlist");
  revalidatePath("/");
  return { ok: true };
}

/**
 * Короткая заметка к чужому желанию.
 *
 * Оставить её может только тот, кто желание не добавлял: смысл в отклике
 * на чужое, а не в приписке к своему. Проверка здесь, а не в политике
 * доступа — правила доступа работают со строкой целиком и не умеют
 * различать, какой столбец меняют.
 */
export async function setWishNote(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Сессия истекла." };

  const id = String(formData.get("id") ?? "");
  const note = String(formData.get("note") ?? "").trim();

  if (!id) return { error: "Желание не найдено." };
  if (note.length > 200) return { error: "Слишком длинно." };

  const { data: wish } = await supabase
    .from("wishes")
    .select("created_by")
    .eq("id", id)
    .maybeSingle();

  if (!wish) return { error: "Желание не найдено." };
  if (wish.created_by === user.id) {
    return { error: "К своему желанию заметку не оставить." };
  }

  const { error } = await supabase
    .from("wishes")
    .update(
      note
        ? { note, note_by: user.id, note_at: new Date().toISOString() }
        : { note: null, note_by: null, note_at: null },
    )
    .eq("id", id);

  if (error) return { error: "Не удалось сохранить." };

  revalidatePath("/wishlist");
  return { ok: true };
}

/** Переключение статуса — доступно обоим партнёрам. */
export async function setWishStatus(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as WishStatus;

  if (!id || !STATUSES.includes(status)) return;

  const supabase = await createClient();
  await supabase
    .from("wishes")
    .update({
      status,
      completed_at: status === "done" ? new Date().toISOString() : null,
    })
    .eq("id", id);

  revalidatePath("/wishlist");
  revalidatePath("/");
}
