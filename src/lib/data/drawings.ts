import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createViewUrls } from "@/lib/storage/r2";
import type {
  Database,
  DrawingOrder,
  DrawingRound,
  DrawingSecret,
} from "@/types/database";

type Client = SupabaseClient<Database>;

export type RoundWithArt = DrawingRound & {
  url: string | null;
  /**
   * Задание. Пусто, если смотреть его пока нельзя — угадывающий не увидит
   * его до своего ответа, потому что база просто не отдаёт эту строку.
   */
  prompt: string | null;
};

/** Что предстоит сделать текущему пользователю в этом раунде. */
export function roundState(round: DrawingRound, userId: string) {
  const isAuthor = round.author_id === userId;

  if (!round.guess) {
    return isAuthor ? ("waiting" as const) : ("to-guess" as const);
  }
  if (round.is_correct === null) {
    return isAuthor ? ("to-judge" as const) : ("judging" as const);
  }
  return "done" as const;
}

export async function loadRounds(
  supabase: Client,
  limit = 50,
): Promise<RoundWithArt[]> {
  const [roundsResult, secretsResult] = await Promise.all([
    supabase
      .from("drawing_rounds")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit),
    // Придут только те задания, которые нам разрешено видеть.
    supabase.from("drawing_secrets").select("*"),
  ]);

  const rounds = (roundsResult.data as DrawingRound[] | null) ?? [];
  if (rounds.length === 0) return [];

  const secrets = (secretsResult.data as DrawingSecret[] | null) ?? [];
  const urls = await createViewUrls(rounds.map((r) => r.storage_path));

  return rounds.map((round) => ({
    ...round,
    url: urls.get(round.storage_path) ?? null,
    prompt: secrets.find((s) => s.round_id === round.id)?.prompt ?? null,
  }));
}

export async function loadRound(
  supabase: Client,
  id: string,
): Promise<RoundWithArt | null> {
  const [roundResult, secretResult] = await Promise.all([
    supabase.from("drawing_rounds").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("drawing_secrets")
      .select("*")
      .eq("round_id", id)
      .maybeSingle(),
  ]);

  const round = roundResult.data as DrawingRound | null;
  if (!round) return null;

  const urls = await createViewUrls([round.storage_path]);

  return {
    ...round,
    url: urls.get(round.storage_path) ?? null,
    prompt: (secretResult.data as DrawingSecret | null)?.prompt ?? null,
  };
}

export type OrderWithArt = DrawingOrder & { url: string | null };

/** Что предстоит сделать текущему пользователю в этом заказе. */
export function orderState(order: DrawingOrder, userId: string) {
  const isCustomer = order.ordered_by === userId;

  if (!order.storage_path) {
    return isCustomer ? ("waiting" as const) : ("to-draw" as const);
  }
  if (order.score === null) {
    return isCustomer ? ("to-score" as const) : ("scoring" as const);
  }
  return "done" as const;
}

export async function loadOrders(
  supabase: Client,
  limit = 50,
): Promise<OrderWithArt[]> {
  const { data } = await supabase
    .from("drawing_orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  const orders = (data as DrawingOrder[] | null) ?? [];
  if (orders.length === 0) return [];

  // Ссылки нужны только тем заказам, по которым уже нарисовано.
  const urls = await createViewUrls(
    orders
      .map((order) => order.storage_path)
      .filter((path): path is string => Boolean(path)),
  );

  return orders.map((order) => ({
    ...order,
    url: order.storage_path ? (urls.get(order.storage_path) ?? null) : null,
  }));
}

export async function loadOrder(
  supabase: Client,
  id: string,
): Promise<OrderWithArt | null> {
  const { data } = await supabase
    .from("drawing_orders")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const order = data as DrawingOrder | null;
  if (!order) return null;

  const urls = order.storage_path
    ? await createViewUrls([order.storage_path])
    : new Map<string, string>();

  return {
    ...order,
    url: order.storage_path ? (urls.get(order.storage_path) ?? null) : null,
  };
}
