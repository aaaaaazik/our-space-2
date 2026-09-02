/**
 * Чтение переменных окружения с понятной ошибкой, если они забыты.
 * Без этого Supabase падает с невнятным «Invalid URL».
 */
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Не задана переменная окружения ${name}. ` +
        `Локально добавьте её в .env.local, на Vercel — в Settings → Environment Variables.`,
    );
  }
  return value;
}

export const supabaseUrl = () =>
  required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);

export const supabaseAnonKey = () =>
  required(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
