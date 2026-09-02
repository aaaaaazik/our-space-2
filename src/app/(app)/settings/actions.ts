"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; message?: string };

export async function updateProfile(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Сессия истекла." };

  const displayName = String(formData.get("display_name") ?? "").trim();
  if (!displayName) return { error: "Имя не может быть пустым." };

  const { error } = await supabase
    .from("profiles")
    .update({ display_name: displayName })
    .eq("id", user.id);

  if (error) return { error: "Не удалось сохранить имя." };

  revalidatePath("/settings");
  revalidatePath("/");
  return { message: "Сохранено." };
}

export async function updateCoupleSettings(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const supabase = await createClient();

  const date = String(formData.get("relationship_start") ?? "").trim();
  const appName = String(formData.get("app_name") ?? "").trim();

  if (!date) return { error: "Укажите дату начала отношений." };

  const start = new Date(`${date}T00:00:00`);
  if (Number.isNaN(start.getTime())) return { error: "Некорректная дата." };
  if (start.getTime() > Date.now()) {
    return { error: "Дата начала не может быть в будущем." };
  }

  const { error } = await supabase
    .from("couple_settings")
    .update({
      relationship_start: start.toISOString(),
      ...(appName ? { app_name: appName } : {}),
    })
    .eq("id", true);

  if (error) return { error: "Не удалось сохранить настройки." };

  revalidatePath("/settings");
  revalidatePath("/");
  return { message: "Сохранено." };
}

export async function changePassword(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 10) {
    return { error: "Пароль должен быть не короче 10 символов." };
  }
  if (password !== confirm) {
    return { error: "Пароли не совпадают." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) return { error: "Не удалось изменить пароль." };

  return { message: "Пароль изменён." };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
