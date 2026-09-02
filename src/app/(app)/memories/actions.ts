"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { notifyPartner } from "@/lib/push/send";
import { createUploadUrl, deleteObjects } from "@/lib/storage/r2";
import type { Photo } from "@/types/database";

export type FormState = { error?: string; ok?: boolean };

/**
 * Что разрешено загружать. Проверка на сервере обязательна:
 * атрибут accept у поля выбора файла — подсказка для браузера,
 * а не защита, его можно обойти.
 */
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Обновляем и раздел, и главную — там показывается счётчик фотографий. */
function refreshPhotoPages() {
  revalidatePath("/memories", "layout");
  revalidatePath("/");
}

// --- Загрузка файлов --------------------------------------------------------

/**
 * Выдаёт браузеру временную ссылку, по которой он сам зальёт файл прямо в R2.
 * Файл не проходит через наш сервер: так быстрее и нет ограничения Vercel
 * на размер тела запроса (4.5 МБ — видео туда не поместилось бы).
 */
export async function requestUploadUrl(
  contentType: string,
): Promise<{ key: string; url: string } | { error: string }> {
  const { user } = await requireUser();
  if (!user) return { error: "Сессия истекла. Войдите заново." };

  if (!ALLOWED_TYPES.has(contentType)) {
    return { error: "Такой тип файла загружать нельзя." };
  }

  const extension = contentType.split("/")[1].replace("quicktime", "mov");
  // Имя генерируем сами: пользовательское может содержать что угодно.
  const key = `${user.id}/${crypto.randomUUID()}.${extension}`;

  try {
    return { key, url: await createUploadUrl(key, contentType) };
  } catch (error) {
    // Ошибку возвращаем как значение, а не бросаем: в боевом режиме
    // Next.js заменяет текст брошенных серверных ошибок на общую фразу,
    // и понять причину по экрану становится невозможно.
    console.error("R2 upload url failed:", error);
    return {
      error:
        error instanceof Error
          ? `Хранилище не настроено: ${error.message}`
          : "Хранилище недоступно.",
    };
  }
}

export type RegisterMedia = {
  key: string;
  kind: "photo" | "video";
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  takenAt: string;
  albumId?: string | null;
  posterKey?: string | null;
  durationSeconds?: number | null;
};

/** Записывает загруженный файл в базу. Вызывается после заливки в R2. */
export async function registerMedia(
  input: RegisterMedia,
): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Сессия истекла." };

  // Ключ всегда начинается с идентификатора владельца — так подставить
  // чужой путь и записать его себе не получится.
  if (!input.key.startsWith(`${user.id}/`)) {
    return { error: "Некорректный файл." };
  }

  const { error } = await supabase.from("photos").insert({
    storage_path: input.key,
    kind: input.kind,
    poster_path: input.posterKey ?? null,
    duration_seconds: input.durationSeconds ?? null,
    mime_type: input.mimeType,
    size_bytes: input.sizeBytes,
    width: input.width,
    height: input.height,
    taken_at: input.takenAt,
    album_id: input.albumId ?? null,
    uploaded_by: user.id,
  });

  if (error) {
    // Строка не записалась — файл в хранилище остался бы мусором.
    await deleteObjects(
      [input.key, input.posterKey].filter((k): k is string => Boolean(k)),
    );
    return { error: "Не удалось сохранить." };
  }

  await notifyPartner(supabase, "photos", {
    title: input.kind === "video" ? "Новое видео 🎬" : "Новое фото 📸",
    body: "Появилось новое воспоминание",
    url: "/memories",
  });

  refreshPhotoPages();
  return {};
}

// --- Альбомы ----------------------------------------------------------------

export async function createAlbum(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Сессия истекла. Войдите заново." };

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Придумайте название альбома." };

  const { error } = await supabase.from("albums").insert({
    title,
    emoji: String(formData.get("emoji") ?? "").trim() || null,
    description: String(formData.get("description") ?? "").trim() || null,
    created_by: user.id,
  });

  if (error) return { error: "Не удалось создать альбом." };

  refreshPhotoPages();
  return { ok: true };
}

export async function deleteAlbum(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { supabase } = await requireUser();
  // Фотографии не пропадут: в схеме стоит on delete set null,
  // они просто вернутся в общий список.
  await supabase.from("albums").delete().eq("id", id);

  refreshPhotoPages();
}

// --- ❤️ на фотографии --------------------------------------------------------

export async function toggleReaction(formData: FormData): Promise<void> {
  const photoId = String(formData.get("photo_id") ?? "");
  const liked = String(formData.get("liked") ?? "") === "1";
  if (!photoId) return;

  const { supabase, user } = await requireUser();
  if (!user) return;

  if (liked) {
    await supabase
      .from("photo_reactions")
      .delete()
      .eq("photo_id", photoId)
      .eq("user_id", user.id);
  } else {
    await supabase
      .from("photo_reactions")
      .insert({ photo_id: photoId, user_id: user.id });
  }

  refreshPhotoPages();
}

// --- Комментарии ------------------------------------------------------------

export async function addComment(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Сессия истекла." };

  const photoId = String(formData.get("photo_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();

  if (!photoId) return { error: "Не понятно, к какой фотографии." };
  if (!body) return { error: "Напишите что-нибудь." };
  if (body.length > 2000) return { error: "Слишком длинный комментарий." };

  const { error } = await supabase
    .from("photo_comments")
    .insert({ photo_id: photoId, author_id: user.id, body });

  if (error) return { error: "Не удалось отправить." };

  refreshPhotoPages();
  return { ok: true };
}

export async function deleteComment(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { supabase } = await requireUser();
  await supabase.from("photo_comments").delete().eq("id", id);

  refreshPhotoPages();
}

// --- Подпись и удаление фотографии ------------------------------------------

export async function updatePhoto(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase } = await requireUser();

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Фотография не найдена." };

  const takenAt = String(formData.get("taken_at") ?? "").trim();
  const albumId = String(formData.get("album_id") ?? "").trim();

  const patch: Partial<Photo> = {
    title: String(formData.get("title") ?? "").trim() || null,
    description: String(formData.get("description") ?? "").trim() || null,
    album_id: albumId || null,
  };

  if (takenAt) {
    const date = new Date(`${takenAt}T12:00:00`);
    if (!Number.isNaN(date.getTime())) patch.taken_at = date.toISOString();
  }

  const { error } = await supabase.from("photos").update(patch).eq("id", id);
  if (error) return { error: "Не удалось сохранить." };

  refreshPhotoPages();
  return { ok: true };
}

export async function deletePhoto(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { supabase, user } = await requireUser();
  if (!user) return;

  // Сначала узнаём пути к файлам — после удаления строки они будут недоступны.
  const { data: photo } = await supabase
    .from("photos")
    .select("storage_path, poster_path")
    .eq("id", id)
    .maybeSingle();

  if (!photo) return;

  // Удалить чужую запись не даст RLS-политика. Проверяем результат:
  // если строка осталась, файлы трогать нельзя.
  const { data: deleted } = await supabase
    .from("photos")
    .delete()
    .eq("id", id)
    .select("id");

  if (!deleted || deleted.length === 0) return;

  await deleteObjects(
    [photo.storage_path, photo.poster_path].filter(
      (key): key is string => Boolean(key),
    ),
  );

  refreshPhotoPages();
}
