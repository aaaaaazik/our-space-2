import "server-only";

/**
 * Кэш публичных ключей, которыми подписаны токены сессии.
 *
 * Зачем: getClaims() умеет проверять подпись локально, но набор ключей ему
 * нужно откуда-то взять. Клиент Supabase создаётся заново на каждый запрос,
 * поэтому его собственный кэш не переживает даже одну страницу — ключи
 * скачивались бы каждый раз, и весь смысл локальной проверки терялся.
 *
 * Здесь кэш живёт на уровне модуля, то есть на всё время работы процесса.
 */

type Jwks = { keys: unknown[] };

let cached: Jwks | null = null;
let cachedAt = 0;
let inFlight: Promise<Jwks | null> | null = null;

/** Ключи меняются крайне редко; час — безопасный компромисс. */
const TTL_MS = 60 * 60 * 1000;

export async function getJwks(supabaseUrl: string): Promise<Jwks | null> {
  if (cached && Date.now() - cachedAt < TTL_MS) return cached;

  // Если несколько запросов пришли одновременно, скачиваем ключи один раз.
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const response = await fetch(
        `${supabaseUrl}/auth/v1/.well-known/jwks.json`,
        { cache: "no-store" },
      );
      if (!response.ok) return null;

      const data = (await response.json()) as Jwks;
      if (!Array.isArray(data?.keys) || data.keys.length === 0) return null;

      cached = data;
      cachedAt = Date.now();
      return cached;
    } catch {
      // Сеть недоступна — вернём null, и getClaims сходит на сервер сам.
      return null;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
