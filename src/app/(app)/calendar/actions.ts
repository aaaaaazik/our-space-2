"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; ok?: boolean };

function refresh() {
  revalidatePath("/calendar");
  revalidatePath("/");
}

/**
 * Новое событие в календаре.
 *
 * Отдельной таблицы у календаря нет: разовое событие ложится в plans,
 * а отмеченное «каждый год» — в important_dates. Разница не только в
 * хранении: повторяющиеся даты рисуются в каждом году, и ночная рассылка
 * напоминает о них заранее.
 */
export async function createEvent(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Сессия истекла. Войдите заново." };

  const title = String(formData.get("title") ?? "").trim();
  const date = String(formData.get("date") ?? "").trim();
  const time = String(formData.get("time") ?? "").trim();
  const yearly = formData.get("yearly") === "on";

  if (!title) return { error: "Добавьте название." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Выберите дату." };

  if (yearly) {
    const emoji = String(formData.get("emoji") ?? "").trim();

    const { error } = await supabase.from("important_dates").insert({
      created_by: user.id,
      label: title,
      // Дата типа date хранится как есть, без часового пояса — день рождения
      // не должен переезжать на соседнее число при перелёте.
      date,
      emoji: emoji || null,
      is_recurring: true,
    });

    if (error) return { error: "Не удалось сохранить дату." };
    refresh();
    return { ok: true };
  }

  // Без времени считаем событие «на весь день» и ставим полдень,
  // чтобы оно не перепрыгнуло на соседний день при смене часового пояса.
  const allDay = time === "";
  const startsAt = new Date(`${date}T${allDay ? "12:00" : time}:00`);

  if (Number.isNaN(startsAt.getTime())) {
    return { error: "Не удалось разобрать дату." };
  }

  const { error } = await supabase.from("plans").insert({
    created_by: user.id,
    title,
    description: String(formData.get("description") ?? "").trim() || null,
    location: String(formData.get("location") ?? "").trim() || null,
    starts_at: startsAt.toISOString(),
    all_day: allDay,
  });

  if (error) return { error: "Не удалось сохранить событие." };

  refresh();
  return { ok: true };
}

export async function deleteEvent(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const kind = String(formData.get("kind") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase
    .from(kind === "date" ? "important_dates" : "plans")
    .delete()
    .eq("id", id);

  refresh();
}
