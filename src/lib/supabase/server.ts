import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import type { Database } from "@/types/database";

import { supabaseAnonKey, supabaseUrl } from "./env";
import { getJwks } from "./jwks";

/**
 * Клиент Supabase для серверных компонентов, Server Actions и route handlers.
 * В Next.js 16 cookies() асинхронна, поэтому функция тоже async.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Серверные компоненты не могут писать cookie — обновление токена
          // берёт на себя proxy.ts, поэтому здесь ошибку можно игнорировать.
        }
      },
    },
  });
}

export type SessionUser = { id: string; email: string | null };

/**
 * Текущий пользователь или null.
 *
 * getClaims(), а не getSession() и не getUser():
 *   • getSession просто верит содержимому cookie — так проверять нельзя;
 *   • getUser надёжен, но идёт на сервер Supabase, а это ~250 мс на запрос;
 *   • getClaims проверяет подпись токена локально ключом ES256 через WebCrypto.
 *     Набор ключей скачивается один раз и кэшируется, дальше сети не нужно.
 *
 * Защита та же: поддельный токен не пройдёт проверку подписи.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const jwks = await getJwks(supabaseUrl());

  const { data, error } = await supabase.auth.getClaims(
    undefined,
    jwks ? { jwks: jwks as { keys: never[] } } : undefined,
  );

  if (error || !data?.claims?.sub) return null;

  return {
    id: String(data.claims.sub),
    email: typeof data.claims.email === "string" ? data.claims.email : null,
  };
}
