import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import type { Database } from "@/types/database";
import { getJwks } from "@/lib/supabase/jwks";

/**
 * Выполняется перед каждым запросом страницы.
 *
 * Две задачи:
 *   1. Продлевает сессию (токен Supabase живёт час и требует обновления).
 *   2. Не пускает неавторизованных дальше страницы входа.
 *
 * В Next.js 16 этот файл раньше назывался middleware.ts,
 * а экспортируемая функция — middleware.
 */

/** Пути, доступные без входа. */
// /offline обязан быть публичным: его сохраняет service worker при установке,
// и делает это ещё до того, как человек успел войти.
//
// /api/cron вызывает расписание Vercel — там нет и не может быть сессии.
// Этот адрес защищает собственный секретный ключ, см. route.ts.
const PUBLIC_PATHS = ["/login", "/auth", "/offline", "/api/cron"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Без ключей проверить сессию невозможно. Пропускаем запрос дальше —
  // страница покажет понятную ошибку о незаполненном .env.local.
  if (!url || !key) return response;

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        // Ответы с новыми токенами не должны попадать в кэш CDN,
        // иначе чужая сессия может быть отдана другому пользователю.
        for (const [headerName, headerValue] of Object.entries(headers)) {
          response.headers.set(headerName, headerValue);
        }
      },
    },
  });

  // getClaims проверяет подпись токена локально, без запроса к Supabase.
  // Ключи для проверки берём из кэша процесса — иначе они скачивались бы
  // при каждом запросе и локальная проверка не давала бы выигрыша.
  const jwks = await getJwks(url);

  const { data, error } = await supabase.auth.getClaims(
    undefined,
    jwks ? { jwks: jwks as { keys: never[] } } : undefined,
  );
  const user = !error && data?.claims?.sub ? data.claims : null;

  const { pathname } = request.nextUrl;

  if (!user && !isPublic(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    // Запоминаем, куда человек шёл, чтобы вернуть его туда после входа.
    if (pathname !== "/") loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && pathname === "/login") {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    homeUrl.search = "";
    return NextResponse.redirect(homeUrl);
  }

  return response;
}

export const config = {
  // Не трогаем статику, картинки, иконки и service worker —
  // иначе проверка сессии заблокирует загрузку CSS и JS.
  // gif, mp4 и webm тоже в списке: наклейки в таких форматах есть
  // и на странице входа, а там сессии ещё нет — без исключения
  // запрос за картинкой уходил бы в перенаправление на /login.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons/|stickers/|sw.js|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|svg|webp|gif|mp4|webm|ico|woff2?)$).*)",
  ],
};
