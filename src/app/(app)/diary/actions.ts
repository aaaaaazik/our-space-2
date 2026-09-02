"use server";

import { revalidatePath } from "next/cache";

import { notifyPartner } from "@/lib/push/send";
import { createUploadUrl, deleteObjects } from "@/lib/storage/r2";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; ok?: boolean };

/**
 * Во что браузеры умеют записывать голос.
 *
 * Safari отдаёт audio/mp4, Chrome — audio/webm. Формат выбирает сам
 * браузер записывающего, поэтому принимаем оба. Важное следствие: webm
 * не проигрывается в Safari. Пока вы оба на айфонах, записи будут в mp4
 * и всё сойдётся; диктофон это учитывает и предпочитает mp4 везде, где
 * тот доступен.
 */
const AUDIO_TYPES: Record<string, string> = {
  "audio/mp4": "m4a",
  "audio/aac": "m4a",
  "audio/mpeg": "mp3",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
};

/**
 * Ссылка, по которой браузер сам зальёт запись голоса в хранилище.
 * Файл не идёт через наш сервер — так же, как фотографии и видео.
 */
export async function requestVoiceUploadUrl(
  contentType: string,
): Promise<{ key: string; url: string } | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Сессия истекла. Войдите заново." };

  // MediaRecorder добавляет к типу кодек: «audio/webm;codecs=opus».
  // Для проверки и для имени файла нужна только часть до точки с запятой.
  const base = contentType.split(";")[0].trim();
  const extension = AUDIO_TYPES[base];

  if (!extension) return { error: "Этот формат записи не поддерживается." };

  const key = `${user.id}/voice/${crypto.randomUUID()}.${extension}`;

  try {
    return { key, url: await createUploadUrl(key, base) };
  } catch (error) {
    console.error("R2 voice upload url failed:", error);
    return { error: "Хранилище недоступно." };
  }
}

/** Насколько отложить открытие. Значения приходят с формы. */
const DELAYS: Record<string, number | null> = {
  now: null,
  week: 7,
  month: 30,
  halfyear: 182,
  year: 365,
  three: 365 * 3,
};

function unlockDate(delay: string, customDate: string): string | null {
  if (delay === "custom") {
    if (!customDate) return null;
    // Полдень, а не полночь: так дата не съедет на сутки при смене
    // часового пояса — например в поездке.
    const date = new Date(`${customDate}T12:00:00`);
    if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
      return null;
    }
    return date.toISOString();
  }

  const days = DELAYS[delay];
  if (!days) return null;

  return new Date(Date.now() + days * 86_400_000).toISOString();
}

export async function createDiaryEntry(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Сессия истекла. Войдите заново." };

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const mood = String(formData.get("mood") ?? "").trim();
  const entryDate = String(formData.get("entry_date") ?? "").trim();

  const audioPath = String(formData.get("audio_path") ?? "").trim();
  const audioSeconds = Number(formData.get("audio_seconds") ?? 0);

  // Заголовок обязателен всегда: по нему письмо видно в списке, а голос
  // в списке не покажешь — его нужно слушать.
  if (!title) return { error: "Добавьте заголовок." };

  const delay = String(formData.get("delay") ?? "now");
  const customDate = String(formData.get("unlock_date") ?? "").trim();

  if (delay === "custom" && !customDate) {
    return { error: "Выберите дату открытия." };
  }

  const unlockAt = unlockDate(delay, customDate);

  if (delay === "custom" && !unlockAt) {
    return { error: "Дата открытия должна быть в будущем." };
  }

  // Сначала сама запись, потом её содержимое: они живут в разных таблицах,
  // чтобы закрытый текст физически не приходил второму раньше срока.
  const { data: entry, error } = await supabase
    .from("diary_entries")
    .insert({
      author_id: user.id,
      entry_date: entryDate || new Date().toISOString().slice(0, 10),
      unlock_at: unlockAt,
    })
    .select("id")
    .single();

  if (error || !entry) return { error: "Не удалось сохранить запись." };

  const { error: contentError } = await supabase.from("diary_contents").insert({
    entry_id: entry.id,
    title,
    body,
    mood: mood || null,
    audio_path: audioPath || null,
    audio_seconds:
      audioPath && audioSeconds > 0 ? Math.min(audioSeconds, 300) : null,
  });

  if (contentError) {
    // Запись без текста бесполезна — убираем.
    await supabase.from("diary_entries").delete().eq("id", entry.id);
    if (audioPath) await deleteObjects([audioPath]).catch(() => {});
    return { error: "Не удалось сохранить текст." };
  }

  // Про запертую запись сообщаем сам факт, но не содержимое:
  // в уведомлении не должно быть того, чего второй ещё не может прочитать.
  await notifyPartner(
    supabase,
    "diary",
    unlockAt
      ? {
          title: "Для тебя оставили запись 🔒",
          body: `Откроется ${new Date(unlockAt).toLocaleDateString("ru-RU", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}`,
          url: "/diary",
        }
      : {
          title: "Новая запись в дневнике 📝",
          body: title,
          url: "/diary",
        },
  );

  revalidatePath("/diary");
  revalidatePath("/");
  return { ok: true };
}

/*
  Удаления писем здесь нет намеренно.

  Письмо — не заметка: написанное однажды остаётся. Возможность стереть
  оказалась лишним соблазном — в минуту, когда письмо кажется неловким,
  его удаляют, а через год именно его и хотят перечитать.

  Политика удаления в самой базе при этом осталась: если решение
  когда-нибудь передумается, вернуть кнопку можно будет одним экраном,
  не трогая схему.
*/
