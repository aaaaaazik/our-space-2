"use server";

import { revalidatePath } from "next/cache";

import { notifyPartner } from "@/lib/push/send";
import { createClient } from "@/lib/supabase/server";
import type { WordKind } from "@/types/database";

export type FormState = { error?: string; ok?: boolean };

const KINDS: WordKind[] = ["rebus", "anagram"];

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function refresh() {
  revalidatePath("/games/words", "layout");
  revalidatePath("/games");
}

/**
 * Перемешивает буквы слова.
 *
 * Проверяем, что порядок действительно изменился: на коротких словах
 * случайная перестановка запросто выдаёт исходное, и загадка получается
 * из разряда «угадай слово ДОМ по подсказке ДОМ».
 */
function scramble(word: string): string {
  const letters = [...word.toUpperCase().replace(/\s+/g, "")];
  if (letters.length < 3) return letters.join(" ");

  for (let attempt = 0; attempt < 12; attempt++) {
    const shuffled = [...letters];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    if (shuffled.join("") !== letters.join("")) return shuffled.join(" ");
  }

  // Слово из одинаковых букв — перемешивать нечего.
  return letters.join(" ");
}

export async function createWordRound(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Сессия истекла. Войдите заново." };

  const kind = String(formData.get("kind") ?? "") as WordKind;
  const word = String(formData.get("word") ?? "").trim();
  const emoji = String(formData.get("clue") ?? "").trim();

  if (!KINDS.includes(kind)) return { error: "Неизвестный вид игры." };
  if (word.length < 2) return { error: "Слово слишком короткое." };
  if (word.length > 40) return { error: "Слово слишком длинное." };

  if (kind === "rebus" && emoji.length === 0) {
    return { error: "Выложите слово смайликами." };
  }

  const clue = kind === "rebus" ? emoji.slice(0, 200) : scramble(word);

  const { data: round, error } = await supabase
    .from("word_rounds")
    .insert({
      author_id: user.id,
      kind,
      clue,
      word_length: word.replace(/\s+/g, "").length,
    })
    .select("id")
    .single();

  if (error || !round) return { error: "Не удалось создать загадку." };

  const { error: secretError } = await supabase
    .from("word_secrets")
    .insert({ round_id: round.id, word });

  if (secretError) {
    // Загадка без слова бесполезна.
    await supabase.from("word_rounds").delete().eq("id", round.id);
    return { error: "Не удалось сохранить слово." };
  }

  await notifyPartner(supabase, "games", {
    title: kind === "rebus" ? "Новый ребус 🧩" : "Новая анаграмма 🔤",
    body: "Попробуй угадать слово",
    url: `/games/words/${round.id}`,
  });

  refresh();
  return { ok: true };
}

/**
 * Проверка ответа.
 *
 * Сравнение делает база: чтобы сверить здесь, пришлось бы сначала прочитать
 * слово — а его как раз читать и нельзя, пока не угадаешь.
 */
export async function tryWord(
  roundId: string,
  attempt: string,
): Promise<{ correct?: boolean; attempts?: number; finished?: boolean; error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Сессия истекла." };

  const value = attempt.trim();
  if (!value) return { error: "Впишите ответ." };
  if (value.length > 60) return { error: "Слишком длинный ответ." };

  const { data, error } = await supabase.rpc("try_word", {
    round: roundId,
    attempt: value,
  });

  if (error) return { error: "Не удалось проверить ответ." };

  const result = (data as Array<{
    correct: boolean;
    attempts: number;
    finished: boolean;
  }> | null)?.[0];

  if (!result) return { error: "Раунд не найден." };

  if (result.finished) {
    await notifyPartner(supabase, "games", {
      title: result.correct ? "Слово угадано 🎉" : "Слово не поддалось 🙈",
      body: result.correct ? "+1 балл" : "Попытки закончились",
      url: `/games/words/${roundId}`,
    });
  }

  refresh();
  return result;
}

export async function deleteWordRound(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { supabase } = await requireUser();
  await supabase.from("word_rounds").delete().eq("id", id);

  refresh();
}
