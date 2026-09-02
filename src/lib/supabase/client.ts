"use client";

import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/types/database";

import { supabaseAnonKey, supabaseUrl } from "./env";

/**
 * Клиент Supabase для кода, выполняющегося в браузере.
 * Сессия хранится в cookie, поэтому сервер видит того же пользователя.
 */
export function createClient() {
  return createBrowserClient<Database>(supabaseUrl(), supabaseAnonKey());
}
