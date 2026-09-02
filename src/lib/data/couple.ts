import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { appConfig } from "@/config/app";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import type { CoupleSettings, Database, Profile } from "@/types/database";

type Client = SupabaseClient<Database>;

/**
 * Проверка входа. Сетевых запросов не делает: подпись токена проверяется
 * локально, поэтому вызывать эту функцию дёшево.
 */
export async function requireSession() {
  const supabase = await createClient();
  const user = await getCurrentUser();

  if (!user) redirect("/login");

  return { supabase, user };
}

/*
  Запросы ниже намеренно возвращают промисы, а не готовые данные.
  Страница складывает их в один Promise.all вместе со своими запросами —
  тогда всё уходит в базу одной волной. Если сначала дождаться профиля,
  а потом запросить фотографии, задержка до сервера оплачивается дважды.
*/

export function profileQuery(supabase: Client, userId: string) {
  return supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
}

export function settingsQuery(supabase: Client) {
  return supabase.from("couple_settings").select("*").maybeSingle();
}

/** Оба профиля — нужны, чтобы подписывать записи именами авторов. */
export function profilesQuery(supabase: Client) {
  return supabase.from("profiles").select("*").order("created_at");
}

export function asProfile(result: { data: unknown }): Profile | null {
  return (result.data as Profile | null) ?? null;
}

export function asProfiles(result: { data: unknown }): Profile[] {
  return (result.data as Profile[] | null) ?? [];
}

/** Настройки пары или разумные значения по умолчанию, если строки ещё нет. */
export function asSettings(result: { data: unknown }): CoupleSettings {
  return (
    (result.data as CoupleSettings | null) ?? {
      id: true,
      app_name: appConfig.name,
      relationship_start: appConfig.fallbackRelationshipStart,
      timezone: appConfig.defaultTimezone,
      updated_at: new Date().toISOString(),
    }
  );
}

/** Быстрый доступ к имени автора записи по его id. */
export function nameOf(profiles: Profile[], id: string | null | undefined) {
  if (!id) return "—";
  return profiles.find((p) => p.id === id)?.display_name ?? "—";
}
