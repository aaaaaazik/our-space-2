import type { SupabaseClient } from "@supabase/supabase-js";

import type { Answer, Database, Question } from "@/types/database";

type Client = SupabaseClient<Database>;

export type QuestionWithAnswers = Question & {
  mine: Answer | null;
  /** Ответ второго. Пока не ответишь сам, база его не отдаёт — здесь будет null. */
  theirs: Answer | null;
};

/**
 * Вопрос дня выбирается по дате, а не случайно.
 *
 * Так у обоих партнёров он одинаковый, и не нужно ни хранить «какой вопрос
 * сегодня», ни запускать что-то по расписанию: одна и та же дата всегда
 * даёт один и тот же номер.
 */
export function questionIndexForDate(date: Date, total: number): number {
  if (total <= 0) return 0;

  // Считаем дни от начала эпохи по календарной дате, без учёта времени,
  // иначе вопрос менялся бы посреди дня при смене часового пояса.
  const days = Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000,
  );

  return ((days % total) + total) % total;
}

/**
 * Какой вопрос показывать сегодня — решает база.
 *
 * Свои вопросы идут первыми, в порядке добавления, и держатся, пока не
 * ответят оба. Посчитать это здесь нельзя: чужой ответ до собственного
 * база не отдаёт, и «ответили оба» в приложении просто не увидеть.
 * Поэтому правило живёт в функции daily_question (миграция 0013).
 */
export function dailyQuestionQuery(supabase: Client) {
  return supabase.rpc("daily_question");
}

/**
 * Вопрос дня из ответа базы.
 *
 * Если функции ещё нет — миграцию не применили — возвращаемся к прежнему
 * выбору по дате, чтобы раздел не оставался пустым.
 */
export function pickDaily<T extends { id: string }>(
  result: { data: unknown },
  questions: T[],
  today: Date,
): T | null {
  if (questions.length === 0) return null;

  const id = typeof result.data === "string" ? result.data : null;
  const chosen = id ? questions.find((q) => q.id === id) : undefined;

  return chosen ?? questions[questionIndexForDate(today, questions.length)];
}

/*
  Запросы возвращают промисы, а не готовые данные: страница складывает их
  в один Promise.all со своими. Раньше здесь было «сначала узнать набор,
  потом его вопросы, потом ответы» — три похода в базу подряд, и задержка
  до Франкфурта оплачивалась трижды.
*/

/** Сам набор — нужен, чтобы знать, куда добавлять свои вопросы. */
export function packQuery(supabase: Client, slug: string) {
  return supabase
    .from("question_packs")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
}

/** Вопросы набора одним запросом — через связь с таблицей наборов. */
export function questionsQuery(supabase: Client, slug: string) {
  return supabase
    .from("questions")
    .select("*, question_packs!inner(slug)")
    .eq("question_packs.slug", slug)
    .order("position")
    .order("created_at");
}

/**
 * Все ответы разом.
 * Строк здесь мало: два человека на несколько десятков вопросов.
 * Забрать всё одним запросом дешевле, чем ждать список вопросов,
 * чтобы отфильтровать по нему.
 */
export function answersQuery(supabase: Client) {
  return supabase.from("answers").select("*");
}

/** Склеивает вопросы с ответами обоих. */
export function withAnswers(
  questionRows: unknown,
  answerRows: unknown,
  currentUserId: string,
): QuestionWithAnswers[] {
  const questions = (questionRows as Question[] | null) ?? [];
  const answers = (answerRows as Answer[] | null) ?? [];

  return questions.map((question) => {
    const forQuestion = answers.filter((a) => a.question_id === question.id);
    return {
      ...question,
      mine: forQuestion.find((a) => a.author_id === currentUserId) ?? null,
      theirs: forQuestion.find((a) => a.author_id !== currentUserId) ?? null,
    };
  });
}
