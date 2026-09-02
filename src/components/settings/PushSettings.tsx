"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff, Share } from "lucide-react";

import { Button } from "@/components/ui/Button";
import {
  removeSubscription,
  saveSubscription,
  sendTestNotification,
} from "@/app/(app)/settings/notifications";

/** Ключ приходит строкой в формате base64url — службе браузера нужны байты. */
function toBytes(base64: string): ArrayBuffer {
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    "=",
  );
  const normal = padded.replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normal);

  // Отдаём именно ArrayBuffer: типы подписки не принимают Uint8Array,
  // у которого буфер может оказаться разделяемым между потоками.
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);

  return buffer;
}

type Support =
  | "checking"
  | "ok"
  /** iOS присылает уведомления только установленному приложению. */
  | "needs-install"
  | "unsupported";

/*
  Возможности браузера читаем через useSyncExternalStore — штатный способ
  для внешнего состояния. Через useEffect с setState было бы проще, но это
  лишний проход отрисовки, и правило react-hooks справедливо на него ругается.

  Значение кэшируется: getSnapshot вызывается на каждой отрисовке и обязан
  возвращать одно и то же, иначе React уходит в бесконечный круг.
*/
let cachedSupport: Support | null = null;

function detectSupport(): Support {
  if (cachedSupport) return cachedSupport;

  const hasApi =
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

  if (hasApi) {
    cachedSupport = "ok";
  } else {
    // На iPhone уведомления появляются только после установки на экран
    // «Домой». Пока сайт открыт в Safari, нужных возможностей просто нет.
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    cachedSupport = isIOS && !standalone ? "needs-install" : "unsupported";
  }

  return cachedSupport;
}

/** Возможности не меняются на лету — подписываться не на что. */
const subscribeToSupport = () => () => {};

/** На сервере браузера нет, поэтому там всегда «проверяем». */
const serverSupport = (): Support => "checking";

export function PushSettings({
  vapidPublicKey,
  enabledHere,
}: {
  vapidPublicKey: string | null;
  /** Есть ли уже подписка именно с этого устройства. */
  enabledHere: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const support = useSyncExternalStore(
    subscribeToSupport,
    detectSupport,
    serverSupport,
  );

  async function enable() {
    if (!vapidPublicKey) {
      setNote("На сервере не заданы ключи для уведомлений.");
      return;
    }

    setBusy(true);
    setNote(null);

    try {
      const result = await Notification.requestPermission();
      setDenied(result === "denied");

      if (result !== "granted") {
        setNote(
          result === "denied"
            ? "Разрешение отклонено. Включить можно в настройках телефона: Safari → Уведомления."
            : "Разрешение не получено.",
        );
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        // Требование браузеров: каждое уведомление должно быть видимым.
        userVisibleOnly: true,
        applicationServerKey: toBytes(vapidPublicKey),
      });

      const json = subscription.toJSON();
      if (!json.keys?.p256dh || !json.keys?.auth) {
        setNote("Браузер не выдал ключи шифрования.");
        return;
      }

      const saved = await saveSubscription({
        endpoint: subscription.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        userAgent: navigator.userAgent.slice(0, 200),
      });

      if (saved.error) {
        setNote(saved.error);
        return;
      }

      startTransition(() => router.refresh());
    } catch (error) {
      setNote(
        error instanceof Error
          ? `Не получилось: ${error.message}`
          : "Не получилось включить уведомления.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await removeSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }

      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  if (support === "checking") {
    return <div className="h-11 animate-pulse rounded-2xl bg-surface-2" />;
  }

  if (support === "needs-install") {
    return (
      <div className="rounded-2xl border border-border bg-surface-2/50 p-3.5">
        <p className="flex items-center gap-1.5 text-[14px] font-medium text-text">
          <Share size={15} aria-hidden />
          Сначала добавьте на экран «Домой»
        </p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-text-muted">
          Apple разрешает уведомления только установленным приложениям.
          В Safari нажмите «Поделиться» → «На экран Домой», откройте
          приложение с иконки и вернитесь сюда.
        </p>
      </div>
    );
  }

  if (support === "unsupported") {
    return (
      <p className="text-[14px] leading-relaxed text-text-muted">
        Этот браузер не умеет присылать уведомления. На iPhone нужна iOS 16.4
        или новее и приложение, установленное на экран «Домой».
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {enabledHere ? (
        <>
          <p className="flex items-center gap-1.5 text-[14px] text-success">
            <Bell size={15} aria-hidden />
            Уведомления включены на этом устройстве
          </p>

          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const result = await sendTestNotification();
                setNote(result.error ?? result.message ?? null);
                setBusy(false);
              }}
            >
              Проверить
            </Button>

            <Button variant="ghost" disabled={busy} onClick={disable}>
              <BellOff size={15} aria-hidden />
              Выключить
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-[14px] leading-relaxed text-text-muted">
            Приходят, даже когда приложение закрыто: новые фотографии,
            записи дневника, ход в игре, годовщины и открытие отложенных
            записей.
          </p>

          <Button disabled={busy} onClick={enable}>
            <Bell size={15} aria-hidden />
            {busy ? "Включаем…" : "Включить уведомления"}
          </Button>

          {denied && (
            <p className="text-[13px] leading-relaxed text-text-muted">
              Разрешение отклонено раньше. Снять запрет можно в настройках
              телефона: Настройки → Safari → Уведомления, либо удалить
              и заново добавить приложение на экран «Домой».
            </p>
          )}
        </>
      )}

      {note && (
        <p role="status" className="text-[13px] leading-relaxed text-text-muted">
          {note}
        </p>
      )}
    </div>
  );
}
