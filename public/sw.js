/*
  Service worker приложения Our Space.

  Написан вручную, без библиотек: Next.js 16 собирается Turbopack,
  а популярные PWA-плагины пока работают только с webpack.

  ВАЖНОЕ РЕШЕНИЕ О ПРИВАТНОСТИ:
  HTML-страницы с личными данными здесь НЕ кэшируются. Иначе фотографии,
  записи дневника и письма оставались бы доступны на устройстве даже
  после выхода из аккаунта. Кэшируется только «оболочка» приложения:
  шрифты, стили, скрипты и страница-заглушка на случай отсутствия сети.
*/

const VERSION = "v1";
const SHELL_CACHE = `our-space-shell-${VERSION}`;
const ASSET_CACHE = `our-space-assets-${VERSION}`;

const OFFLINE_URL = "/offline";

const SHELL_FILES = [
  OFFLINE_URL,
  "/icons/icon-192.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // addAll падает целиком, если хотя бы один файл недоступен,
      // поэтому кладём файлы по одному.
      await Promise.all(
        SHELL_FILES.map(async (url) => {
          try {
            await cache.add(new Request(url, { cache: "reload" }));
          } catch {
            /* файл появится позже — не повод ломать установку */
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name !== SHELL_CACHE && name !== ASSET_CACHE)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

/** Выход из аккаунта — страница просит очистить всё сохранённое. */
self.addEventListener("message", (event) => {
  if (event.data?.type === "CLEAR_CACHES") {
    event.waitUntil(
      caches.keys().then((names) => Promise.all(names.map((n) => caches.delete(n)))),
    );
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Чужие домены (в т.ч. хранилище фотографий) и не-GET не трогаем:
  // ссылки на фото подписаны и живут час, кэшировать их бессмысленно.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Переходы между страницами: всегда идём в сеть.
  // Нет сети — показываем заглушку, но не чужое содержимое из кэша.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          const offline = await cache.match(OFFLINE_URL);
          return (
            offline ??
            new Response("Нет соединения", {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            })
          );
        }
      })(),
    );
    return;
  }

  // Статика Next.js уникальна по имени файла, поэтому её безопасно
  // отдавать из кэша сразу и обновлять в фоне.
  const isStatic =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/");

  if (isStatic) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSET_CACHE);
        const cached = await cache.match(request);

        const network = fetch(request)
          .then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => undefined);

        return cached ?? (await network) ?? Response.error();
      })(),
    );
  }
});

/*
  Push-уведомления. Обработчики готовы заранее, но реально уведомления
  начнут приходить только после Этапа 3, когда появится серверная отправка.

  На iPhone это работает лишь при двух условиях:
  iOS 16.4 и новее И приложение добавлено на домашний экран.
*/
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Our Space", body: event.data.text() };
  }

  /*
    tag намеренно не задаём.

    Уведомления с одинаковым tag заменяют друг друга: пришло второе —
    первое молча исчезает, и телефон второй раз даже не вздрагивает.
    Для «думаю о тебе» это было бы прямо противоположно задуманному:
    десять нажатий должны быть десятью уведомлениями.

    vibrate на айфоне игнорируется — там вибрация целиком в ведении iOS.
    Для Android рисунок вибрации задаёт отправитель.
  */
  event.waitUntil(
    self.registration.showNotification(payload.title ?? "Our Space", {
      body: payload.body ?? "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      vibrate: payload.vibrate ?? [100],
      data: { url: payload.url ?? "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url ?? "/";

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // Приложение уже открыто — просто переводим его на нужную страницу.
      for (const client of clientList) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus();
          if ("navigate" in client) await client.navigate(target);
          return;
        }
      }

      await self.clients.openWindow(target);
    })(),
  );
});
