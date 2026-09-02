import "server-only";

import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

import { appConfig } from "@/config/app";
import type { Database } from "@/types/database";

/**
 * Отправка push-уведомлений.
 *
 * Как это работает: браузер второго человека заранее выдал адрес, по которому
 * его можно разбудить. Мы отправляем туда зашифрованное сообщение, а служба
 * браузера доставляет его на устройство — даже если приложение закрыто.
 *
 * Ключи VAPID подтверждают, что отправитель — именно наш сайт. Без них
 * службы браузеров сообщение не примут.
 */

export type PushKind =
  | "photos"
  | "diary"
  | "games"
  | "dates"
  | "daily"
  | "thoughts"
  | "chat";

export type PushMessage = {
  title: string;
  body: string;
  /** Куда открыть приложение по нажатию. */
  url?: string;
  /**
   * Рисунок вибрации: [вибрация, пауза, вибрация] в миллисекундах.
   *
   * На айфоне не работает и работать не будет. Safari не поддерживает
   * управление вибрацией ни из страницы, ни из уведомления — телефон
   * вибрирует так, как задано в настройках самой iOS, и повлиять на это
   * из приложения нельзя. Здесь это для Android и на будущее.
   */
  vibrate?: number[];
};

type Target = { endpoint: string; p256dh: string; auth: string };

let configured = false;

function configure(): boolean {
  if (configured) return true;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  if (!publicKey || !privateKey) return false;

  webpush.setVapidDetails(
    // Контакт на случай проблем с доставкой. Адрес может быть любым.
    "mailto:noreply@our-space.app",
    publicKey,
    privateKey,
  );
  configured = true;
  return true;
}

/**
 * Отправляет уведомление на устройства.
 * Ошибки не бросает: неудачная отправка не должна ломать сохранение записи
 * или загрузку фотографии.
 */
export async function pushTo(
  targets: Target[],
  message: PushMessage,
  onGone?: (endpoint: string) => Promise<void>,
): Promise<{ sent: number }> {
  if (targets.length === 0) return { sent: 0 };
  if (!configure()) {
    console.warn("push: ключи VAPID не заданы, уведомление не отправлено");
    return { sent: 0 };
  }

  const payload = JSON.stringify({
    title: message.title,
    body: message.body,
    url: message.url ?? "/",
    vibrate: message.vibrate,
  });

  let sent = 0;

  await Promise.all(
    targets.map(async (target) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: target.endpoint,
            keys: { p256dh: target.p256dh, auth: target.auth },
          },
          payload,
        );
        sent += 1;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;

        // 404 и 410 означают, что подписка мертва: приложение удалили
        // или разрешение отозвали. Такие адреса надо убирать, иначе
        // список будет только расти.
        if (status === 404 || status === 410) {
          await onGone?.(target.endpoint);
        } else {
          console.error("push failed:", status, error);
        }
      }
    }),
  );

  return { sent };
}

/**
 * Шлёт уведомление второму человеку от имени текущего.
 *
 * Список его устройств мы прочитать не можем — это чужие данные. Функция
 * в базе отдаёт только адреса для отправки и только если он разрешил
 * такой тип уведомлений и сейчас не его тихие часы.
 */
export async function notifyPartner(
  supabase: SupabaseClient<Database>,
  kind: PushKind,
  message: PushMessage,
): Promise<void> {
  const { data, error } = await supabase.rpc("partner_push_targets", { kind });

  if (error || !data) return;

  await pushTo(data as Target[], message, async (endpoint) => {
    // Чужую подписку удалить не можем — просто перестанем в неё слать:
    // при следующем открытии приложения браузер пришлёт свежий адрес.
    console.info("push: адрес больше не действителен", endpoint.slice(0, 40));
  });
}

/** Название приложения в заголовке — чтобы уведомление было узнаваемым. */
export const appName = appConfig.name;
