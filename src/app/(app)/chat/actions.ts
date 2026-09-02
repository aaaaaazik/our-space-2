"use server";

import { revalidatePath } from "next/cache";

import { notifyPartner } from "@/lib/push/send";
import { createUploadUrl, deleteObjects } from "@/lib/storage/r2";
import { createClient } from "@/lib/supabase/server";

export type SendState = { error?: string; ok?: boolean };

/** Те же форматы, что и в голосовых письмах — почему именно они, см. diary/actions.ts. */
const AUDIO_TYPES: Record<string, string> = {
  "audio/mp4": "m4a",
  "audio/aac": "m4a",
  "audio/mpeg": "mp3",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
};

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Ссылка, по которой браузер сам зальёт голосовое сообщение в хранилище. */
export async function requestChatVoiceUrl(
  contentType: string,
): Promise<{ key: string; url: string } | { error: string }> {
  const { user } = await requireUser();
  if (!user) return { error: "Сессия истекла. Войдите заново." };

  const base = contentType.split(";")[0].trim();
  const extension = AUDIO_TYPES[base];
  if (!extension) return { error: "Этот формат записи не поддерживается." };

  const key = `${user.id}/chat/${crypto.randomUUID()}.${extension}`;

  try {
    return { key, url: await createUploadUrl(key, base) };
  } catch (error) {
    console.error("R2 chat voice url failed:", error);
    return { error: "Хранилище недоступно." };
  }
}

export async function sendMessage(
  _prev: SendState,
  formData: FormData,
): Promise<SendState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Сессия истекла. Войдите заново." };

  const body = String(formData.get("body") ?? "").trim();
  const audioPath = String(formData.get("audio_path") ?? "").trim();
  const audioSeconds = Number(formData.get("audio_seconds") ?? 0);

  if (!body && !audioPath) return { error: "Пустое сообщение." };
  if (body.length > 4000) return { error: "Слишком длинное сообщение." };

  const { error } = await supabase.from("messages").insert({
    author_id: user.id,
    body: body || null,
    audio_path: audioPath || null,
    audio_seconds:
      audioPath && audioSeconds > 0 ? Math.min(audioSeconds, 300) : null,
  });

  if (error) {
    // Файл уже в хранилище, а строки нет — убираем, чтобы не висел зря.
    if (audioPath) await deleteObjects([audioPath]).catch(() => {});
    return { error: "Не удалось отправить." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  await notifyPartner(supabase, "chat", {
    title: profile?.display_name ?? "Новое сообщение",
    // Голосовое не пересказываем — его надо слушать.
    body: body || "🎤 Голосовое сообщение",
    url: "/chat",
  });

  revalidatePath("/chat");
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Отмечает чужие сообщения прочитанными.
 *
 * Вызывается из браузера, когда чат открыт и виден, а не при отрисовке
 * страницы на сервере. Разница важная: страницу приложение подгружает
 * заранее, ещё до того как на неё зашли, и сообщения помечались бы
 * прочитанными, которых человек даже не видел.
 */
export async function markRead(): Promise<void> {
  const { supabase, user } = await requireUser();
  if (!user) return;

  await supabase
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .neq("author_id", user.id)
    .is("read_at", null);

  // Слой целиком: счётчик непрочитанных живёт в нижней навигации,
  // а она общая для всех страниц.
  revalidatePath("/", "layout");
}

export async function deleteMessage(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { supabase } = await requireUser();

  // Ключ файла читаем до удаления строки: потом его будет неоткуда взять.
  const { data: message } = await supabase
    .from("messages")
    .select("audio_path")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("messages").delete().eq("id", id);

  if (!error && message?.audio_path) {
    await deleteObjects([message.audio_path]).catch(() => {});
  }

  revalidatePath("/chat");
  revalidatePath("/", "layout");
}
