"use client";

import { useEffect } from "react";

/**
 * Регистрирует service worker — без него сайт не устанавливается
 * как приложение и не работает офлайн.
 *
 * Ничего не рисует: только побочный эффект при загрузке страницы.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // В режиме разработки service worker только мешает:
    // он отдаёт из кэша старые версии файлов.
    if (process.env.NODE_ENV !== "production") return;

    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Регистрация недоступна (например, страница открыта не по HTTPS) —
      // приложение продолжает работать как обычный сайт.
    });
  }, []);

  return null;
}
