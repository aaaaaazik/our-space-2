"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { CELLS, HEARTS } from "@/lib/games/hearts";
import { notifyPartner } from "@/lib/push/send";
import { createClient } from "@/lib/supabase/server";

export type HeartsState = { error?: string; ok?: boolean };

/** Что вернул залп: по строке на каждую клетку плюс признак конца партии. */
export type SalvoResult = {
  error?: string;
  shots?: Array<{ idx: number; hit: boolean }>;
  finished?: boolean;
};

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function refresh() {
  revalidatePath("/games/hearts");
  revalidatePath("/games");
}

/**
 * Ошибки из базы приходят понятным текстом («сейчас не ваш ход»), и
 * показывать их можно как есть. Но если что-то пошло не так глубже,
 * наружу полезет служебное — на такой случай запасная фраза.
 */
function reason(error: { message?: string } | null, fallback: string): string {
  const message = error?.message?.trim();
  if (!message) return fallback;

  // Сообщения наших проверок короткие и на русском; всё длинное и
  // латиницей — это уже внутренности Postgres.
  return message.length < 60 && /[а-яё]/i.test(message) ? message : fallback;
}

export async function startGame(): Promise<HeartsState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Сессия истекла. Войдите заново." };

  const { error } = await supabase.rpc("start_hearts_game");
  if (error) return { error: reason(error, "Не удалось начать партию.") };

  refresh();
  return { ok: true };
}

export async function placeHearts(
  _prev: HeartsState,
  formData: FormData,
): Promise<HeartsState> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Сессия истекла. Войдите заново." };

  const game = String(formData.get("game") ?? "");
  const cells = String(formData.get("cells") ?? "")
    .split(",")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 0 && n < CELLS);

  if (!game) return { error: "Партия не найдена." };
  if (cells.length !== HEARTS) {
    return { error: `Нужно ровно ${HEARTS} сердец.` };
  }

  const { error } = await supabase.rpc("place_hearts", { game, cells });
  if (error) return { error: reason(error, "Не удалось расставить.") };

  await notifyPartner(supabase, "games", {
    title: "Сердечный бой 💘",
    body: "Расставь свои сердца — и начинаем",
    url: "/games/hearts",
  });

  refresh();
  return { ok: true };
}

/**
 * Залп: несколько клеток разом.
 *
 * Так партия перестаёт быть перепиской длиной в неделю. Раньше за ход
 * стреляли по одной клетке, и после каждой нужно было ждать второго —
 * на поле в шестнадцать клеток это до пятнадцати ожиданий.
 *
 * Возвращает результат сразу, а не оставляет странице догадываться.
 * revalidatePath здесь намеренно нет: из-за него Next.js вкладывал бы
 * в ответ заново отрисованную страницу целиком, и залп отзывался бы
 * через секунду. Страница показывает результат по этому ответу, а
 * сверяется с сервером уже потом, в фоне.
 */
export async function fireSalvo(
  game: string,
  cells: number[],
): Promise<SalvoResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Сессия истекла. Войдите заново." };

  const clean = cells.filter(
    (cell) => Number.isInteger(cell) && cell >= 0 && cell < CELLS,
  );

  if (!game || clean.length === 0) return { error: "Клетки не выбраны." };

  const { data, error } = await supabase.rpc("fire_salvo", {
    game,
    cells: clean,
  });

  if (error) return { error: reason(error, "Не удалось выстрелить.") };

  const rows =
    (data as Array<{ idx: number; hit: boolean; finished: boolean }>) ?? [];
  const finished = rows.some((row) => row.finished);

  /*
    Уведомление уходит уже после ответа.

    Отправка push — это обращение к службам Apple и Google, полсекунды на
    ровном месте. Раньше ответ ждал её, и результат показывался с этой
    задержкой. after() выполняет всё, что внутри, когда ответ уже ушёл.
  */
  after(async () => {
    await notifyPartner(
      supabase,
      "games",
      finished
        ? {
            title: "Сердечный бой окончен 💔",
            body: "Все сердца разбиты — посмотри, чем всё кончилось",
            url: "/games/hearts",
          }
        : {
            title: "Твой ход 💘",
            body: "Залп сделан — теперь ваша очередь",
            url: "/games/hearts",
          },
    );
  });

  return {
    shots: rows.map(({ idx, hit }) => ({ idx, hit })),
    finished,
  };
}

export async function abandonGame(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { supabase } = await requireUser();
  await supabase.from("hearts_games").delete().eq("id", id);

  refresh();
}
