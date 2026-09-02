"use client";

import {
  useActionState,
  useEffect,
  useOptimistic,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { Mic, Send, Trash2, X } from "lucide-react";

import { VoicePlayer } from "@/components/ui/VoicePlayer";
import { VoiceRecorder, type Recording } from "@/components/ui/VoiceRecorder";
import {
  deleteMessage,
  markRead,
  requestChatVoiceUrl,
  sendMessage,
  type SendState,
} from "@/app/(app)/chat/actions";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";
import type { Message } from "@/types/database";

export type ChatMessage = Message & { audioUrl: string | null };

export function ChatRoom({
  items,
  currentUserId,
  partnerName,
}: {
  items: ChatMessage[];
  currentUserId: string;
  partnerName: string;
}) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Имя канала уникально для каждой копии компонента: Supabase ищет канал
  // по имени и переиспользует найденный, а подписаться на уже подписанный
  // нельзя — вторая копия падала бы с ошибкой.
  const [channelId] = useState(() => Math.random().toString(36).slice(2));

  const [text, setText] = useState("");
  const [voice, setVoice] = useState<Recording | null>(null);
  const [recorderOpen, setRecorderOpen] = useState(false);

  const [messages, addOptimistic] = useOptimistic<ChatMessage[], ChatMessage>(
    items,
    (state, message) => [...state, message],
  );

  /*
    Живая доставка.

    На любое изменение таблицы просто перечитываем страницу с сервера,
    а не достраиваем список из пришедших данных. Причина в голосовых:
    в событии приходит ключ файла, а не ссылка на него — подписать её
    может только сервер. Перечитать всё разом и проще, и надёжнее, а
    сообщений у двоих людей столько, что разница незаметна.
  */
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`messages-${channelId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router, channelId]);

  /*
    Отметка о прочтении.

    Ставится из браузера, когда чат открыт и виден. На сервере при отрисовке
    страницы это делать нельзя: приложение подгружает страницы заранее, ещё
    до перехода на них, и сообщения помечались бы прочитанными, которых
    человек не видел.
  */
  useEffect(() => {
    const mark = () => {
      if (document.visibilityState === "visible") void markRead();
    };

    mark();
    document.addEventListener("visibilitychange", mark);
    return () => document.removeEventListener("visibilitychange", mark);
  }, [items.length]);

  // Всегда показываем конец переписки — как в любом мессенджере.
  useEffect(() => {
    const box = scrollRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [messages.length]);

  const [state, action, pending] = useActionState<SendState, FormData>(
    async (prev, formData) => {
      const body = String(formData.get("body") ?? "").trim();
      if (!body && !voice) return {};

      // Показываем сообщение сразу, не дожидаясь сервера. React сам уберёт
      // его, когда действие закончится и придут настоящие данные.
      addOptimistic({
        id: `local-${Date.now()}`,
        author_id: currentUserId,
        body: body || null,
        audio_path: null,
        audio_seconds: voice?.seconds ?? null,
        audioUrl: voice?.url ?? null,
        read_at: null,
        created_at: new Date().toISOString(),
      });

      setText("");

      if (voice) {
        const uploaded = await uploadVoice(voice);
        if ("error" in uploaded) return { error: uploaded.error };

        formData.set("audio_path", uploaded.key);
        formData.set("audio_seconds", String(voice.seconds));
      }

      const result = await sendMessage(prev, formData);
      if (result.ok) {
        setVoice(null);
        setRecorderOpen(false);
      }
      return result;
    },
    {},
  );

  const canSend = text.trim().length > 0 || voice !== null;

  return (
    /*
      Высота ровно до нижней навигации: прокручиваться должна переписка,
      а поле ввода обязано оставаться на месте.

      Отрицательный отступ снизу гасит запас, который общая обёртка
      оставляет под навигацию для обычных страниц. Там этот запас нужен,
      чтобы содержимое не упиралось в панель, а здесь поле ввода должно
      лежать на ней вплотную — иначе между ними висит пустая полоса.
    */
    <div className="-mb-[calc(4.5rem+env(safe-area-inset-bottom))] flex h-[calc(100dvh-3.5rem-env(safe-area-inset-bottom))] flex-col">
      <header className="shrink-0 px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-2.5">
        <h1 className="font-display text-[22px] text-text">{partnerName}</h1>
      </header>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-2"
      >
        {messages.length === 0 ? (
          <p className="mt-16 text-center text-[14px] leading-relaxed text-text-faint">
            Здесь пока пусто.
            <br />
            Напишите первое слово.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {messages.map((message, i) => (
              <Bubble
                key={message.id}
                message={message}
                mine={message.author_id === currentUserId}
                showDate={isNewDay(messages[i - 1], message)}
                last={i === messages.length - 1}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="shrink-0 border-t border-border bg-surface/95 px-3 pt-2.5 pb-3">
        {recorderOpen && (
          <div className="mb-2.5">
            <VoiceRecorder value={voice} onChange={setVoice} />
          </div>
        )}

        <form action={action} className="flex items-end gap-2">
          <input type="hidden" name="body" value={text} />

          <button
            type="button"
            onClick={() => {
              setRecorderOpen((open) => !open);
              if (recorderOpen) setVoice(null);
            }}
            aria-label={recorderOpen ? "Убрать диктофон" : "Записать голосом"}
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-full",
              recorderOpen
                ? "bg-surface-2 text-text-muted"
                : "text-text-muted active:bg-surface-2",
            )}
          >
            {recorderOpen ? (
              <X size={19} aria-hidden />
            ) : (
              <Mic size={19} aria-hidden />
            )}
          </button>

          <Input value={text} onChange={setText} />

          <button
            type="submit"
            disabled={!canSend || pending}
            aria-label="Отправить"
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-full",
              "transition-colors duration-150",
              canSend && !pending
                ? "bg-accent text-on-accent active:scale-95"
                : "bg-surface-2 text-text-faint",
            )}
          >
            <Send size={18} aria-hidden />
          </button>
        </form>

        {state.error && (
          <p role="status" className="mt-1.5 text-center text-[12px] text-danger">
            {state.error}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Поле ввода, растущее под текст.
 *
 * Обычный однострочный input прячет начало длинного сообщения, а textarea
 * фиксированной высоты занимает пол-экрана даже под одно слово. Высота
 * подгоняется под содержимое и упирается в потолок примерно в пять строк.
 */
function Input({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const field = ref.current;
    if (!field) return;

    // Сбрасываем перед замером: иначе высота умеет только расти.
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, 120)}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        // Enter на телефоне переводит строку — отправляет кнопка.
        // На компьютере привычно ещё и Ctrl+Enter.
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          event.currentTarget.form?.requestSubmit();
        }
      }}
      placeholder="Сообщение…"
      // text-base обязателен: при меньшем размере Safari зумит страницу.
      className="max-h-[120px] min-h-11 flex-1 resize-none rounded-2xl border border-border bg-surface px-4 py-2.5 text-base leading-snug text-text outline-none placeholder:text-text-faint focus:border-accent"
    />
  );
}

function Bubble({
  message,
  mine,
  showDate,
  last,
}: {
  message: ChatMessage;
  mine: boolean;
  showDate: boolean;
  last: boolean;
}) {
  const time = new Date(message.created_at).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Сообщение, которое ещё не долетело до сервера, удалять нечего.
  const saved = !message.id.startsWith("local-");

  return (
    <>
      {showDate && (
        <li className="py-3 text-center text-[11px] tracking-wide text-text-faint uppercase">
          {dayLabel(message.created_at)}
        </li>
      )}

      <li className={cn("group flex", mine ? "justify-end" : "justify-start")}>
        <div
          className={cn(
            "max-w-[80%] rounded-3xl px-4 py-2.5",
            mine
              ? "bg-accent text-on-accent"
              : "border border-border bg-surface text-text",
          )}
        >
          {message.audioUrl && message.audio_seconds && (
            <div className={cn(message.body && "mb-2")}>
              <VoicePlayer
                src={message.audioUrl}
                seconds={message.audio_seconds}
              />
            </div>
          )}

          {message.body && (
            <p className="text-[15px] leading-snug break-words whitespace-pre-wrap">
              {message.body}
            </p>
          )}

          <p
            className={cn(
              "mt-1 flex items-center justify-end gap-1.5 text-[11px]",
              mine ? "text-on-accent/60" : "text-text-faint",
            )}
          >
            {time}
            {/* «Прочитано» показываем только у последнего своего сообщения:
                галочка под каждым превращает переписку в бухгалтерию. */}
            {mine && last && saved && (
              <span>{message.read_at ? "прочитано" : "отправлено"}</span>
            )}
          </p>
        </div>

        {mine && saved && (
          <form action={deleteMessage} className="self-center">
            <input type="hidden" name="id" value={message.id} />
            <button
              type="submit"
              aria-label="Удалить сообщение"
              className="mr-1 flex size-8 items-center justify-center rounded-full text-text-faint opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
            >
              <Trash2 size={13} aria-hidden />
            </button>
          </form>
        )}
      </li>
    </>
  );
}

/** Разделитель дня появляется, когда предыдущее сообщение было раньше. */
function isNewDay(previous: ChatMessage | undefined, current: ChatMessage) {
  if (!previous) return true;

  return (
    new Date(previous.created_at).toDateString() !==
    new Date(current.created_at).toDateString()
  );
}

function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);

  if (date.toDateString() === today.toDateString()) return "Сегодня";
  if (date.toDateString() === yesterday.toDateString()) return "Вчера";

  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year:
      date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

/** Заливает голосовое в хранилище и возвращает ключ файла. */
async function uploadVoice(
  voice: Recording,
): Promise<{ key: string } | { error: string }> {
  const type = voice.blob.type || "audio/mp4";
  const slot = await requestChatVoiceUrl(type);

  if ("error" in slot) return slot;

  try {
    const response = await fetch(slot.url, {
      method: "PUT",
      headers: { "Content-Type": type.split(";")[0].trim() },
      body: voice.blob,
    });

    if (!response.ok) {
      return { error: `Хранилище ответило ${response.status}.` };
    }
  } catch {
    return { error: "Не удалось отправить запись. Проверьте связь." };
  }

  return { key: slot.key };
}
