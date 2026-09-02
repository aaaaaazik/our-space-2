"use client";

import { useState } from "react";
import { Clock, Lock, Mic } from "lucide-react";

import type { DiaryItem } from "@/lib/data/diary";
import { untilUnlock } from "@/lib/data/diary";
import { LetterView } from "./LetterView";

/**
 * Список писем.
 *
 * Текста здесь намеренно нет — ни строчки, ни отрывка. Смысл в том, чтобы
 * письмо читалось только внутри, а список оставался стопкой конвертов.
 */
export function DiaryList({
  items,
  currentUserId,
  names,
}: {
  items: DiaryItem[];
  currentUserId: string;
  /**
   * Имена словарём, а не функцией: между сервером и браузером можно
   * передавать только данные. Функция сюда не доедет — страница падает.
   */
  names: Record<string, string>;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = items.find((item) => item.id === openId) ?? null;

  const nameOf = (id: string) => names[id] ?? "—";

  return (
    <>
      <ul className="space-y-2.5">
        {items.map((item) => (
          // Покачивания нет по той же причине, что и в сетке фотографий:
          // записей со временем становится много, а каждая качающаяся
          // строка стоит телефону отдельной картинки в видеокарте.
          <li key={item.id}>
            <Row
              item={item}
              currentUserId={currentUserId}
              nameOf={nameOf}
              onOpen={() => setOpenId(item.id)}
            />
          </li>
        ))}
      </ul>

      <LetterView
        item={open}
        authorName={open ? nameOf(open.author_id) : ""}
        isMine={open?.author_id === currentUserId}
        onClose={() => setOpenId(null)}
      />
    </>
  );
}

function Row({
  item,
  currentUserId,
  nameOf,
  onOpen,
}: {
  item: DiaryItem;
  currentUserId: string;
  nameOf: (id: string) => string;
  onOpen: () => void;
}) {
  const isMine = item.author_id === currentUserId;
  const authorName = nameOf(item.author_id);

  const countdown = item.unlock_at ? untilUnlock(item.unlock_at) : null;
  const stillLocked = Boolean(countdown);

  const date = new Date(item.entry_date).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Чужая запертая запись: содержимого нет и не будет до срока.
  if (item.locked) {
    return (
      <div className="rounded-3xl border border-border bg-surface/82 px-5 py-6 text-center">
        <p className="text-xl" aria-hidden>
          🔒
        </p>
        {/* Без глагола — и так короче и лучше, чем «оставила запись». */}
        <p className="mt-2 font-display text-[17px] text-text">
          Письмо от {authorName}
        </p>
        <p className="mt-1 text-[13px] text-text-muted">
          {countdown ? `Откроется через ${countdown}` : "Скоро откроется"}
        </p>
        {item.unlock_at && (
          <p className="mt-0.5 text-[12px] text-text-faint">
            {new Date(item.unlock_at).toLocaleDateString("ru-RU", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        )}
      </div>
    );
  }

  if (!item.content) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onOpen}
        className="block w-full rounded-3xl border border-border bg-surface/92 px-5 py-4 text-left shadow-card transition-transform duration-150 active:scale-[0.99]"
      >
        <p className="text-[11px] tracking-[0.18em] text-text-faint uppercase">
          {date}
        </p>

        <p className="mt-1.5 pr-9 font-display text-[19px] leading-snug text-text">
          {item.content.title}
        </p>

        <div className="mt-3 flex items-center gap-2.5">
          {/* Значок голоса — чтобы было видно, что письмо надо слушать,
              ещё до того как его откроют. */}
          {item.audioUrl && (
            <span className="flex shrink-0 items-center gap-1 text-[12px] text-accent">
              <Mic size={12} aria-hidden />
              голосом
            </span>
          )}

          {/* Тонкая линия вместо отрывка текста — намёк, что внутри что-то есть */}
          <span className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />

          <span className="text-[13px] whitespace-nowrap text-text-muted">
            {authorName} <span className="text-accent">♡</span>
          </span>
        </div>

        {isMine && stillLocked && (
          <p className="mt-2.5 flex items-center gap-1.5 text-[12px] text-accent">
            <Lock size={11} aria-hidden />
            откроется через {countdown}
          </p>
        )}
      </button>

      {/*
        Кнопки удаления здесь нет намеренно.

        Письмо — не заметка: написанное однажды остаётся. Возможность
        стереть оказалась лишним соблазном — в минуту, когда письмо
        кажется неловким, его удаляют, а через год именно его и хотят
        перечитать.
      */}
    </div>
  );
}

/** Заголовок группы «ждут своего часа». */
export function WaitingHeading() {
  return (
    <h2 className="mb-2.5 flex items-center gap-1.5 text-[12px] tracking-wide text-text-faint uppercase">
      <Clock size={12} aria-hidden />
      Ждут своего часа
    </h2>
  );
}
