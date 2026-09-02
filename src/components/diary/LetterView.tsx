"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";

import { VoicePlayer } from "@/components/ui/VoicePlayer";
import type { DiaryItem } from "@/lib/data/diary";
import { usePrefersReducedMotion, useTypewriter } from "./useTypewriter";

/**
 * Открытие письма.
 *
 * Задача — ощущение погружения, а не эффектов ради эффектов. Движение
 * разложено на три волны, которые накладываются друг на друга:
 *
 *   1. тьма закрывает список (0–0.26 с);
 *   2. сквозь неё проступает тёплый свет (0.1–0.5 с);
 *   3. лист приближается (0.14–0.62 с).
 *
 * Ничего не начинается ровно там, где кончается предыдущее — иначе переход
 * читается как последовательность шагов, а не как одно движение.
 *
 * Анимируются только прозрачность и положение. Размытие отсюда убрано
 * намеренно: filter: blur пересчитывается на каждом кадре и на телефоне
 * съедает как раз те кадры, ради плавности которых всё и затевалось.
 * Плавность даёт кривая ускорения, а не эффект.
 */

/** Плавная кривая: быстрый разгон, долгое мягкое торможение. */
const EASE = [0.16, 1, 0.3, 1] as const;

export function LetterView({
  item,
  authorName,
  isMine,
  onClose,
}: {
  item: DiaryItem | null;
  authorName: string;
  isMine: boolean;
  onClose: () => void;
}) {
  const open = item !== null;
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Пятна на фоне продолжают плыть и под письмом, хотя их не видно.
    // Это большие размытые области — на телефоне они забирают заметную
    // часть кадров. На время чтения останавливаем их.
    document.documentElement.setAttribute("data-letter-open", "");

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = previous;
      document.documentElement.removeAttribute("data-letter-open");
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && item?.content && (
        <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain">
          {/* Волна 1: темнота накрывает список */}
          <motion.div
            className="fixed inset-0 bg-[#0d0a11]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0.12 : 0.26, ease: "easeOut" }}
          />

          {/* Волна 2: сквозь темноту проступает тёплый свет */}
          <motion.div
            className="pointer-events-none fixed inset-0"
            style={{
              background:
                "radial-gradient(80% 60% at 50% 38%, rgba(214,178,124,0.30) 0%, rgba(140,96,70,0.12) 45%, transparent 72%)",
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{
              delay: reduced ? 0 : 0.1,
              duration: reduced ? 0.12 : 0.4,
              ease: "easeOut",
            }}
          />

          <motion.button
            type="button"
            onClick={onClose}
            aria-label="Закрыть письмо"
            className="fixed top-[max(1rem,env(safe-area-inset-top))] right-4 z-10 flex size-11 items-center justify-center rounded-full bg-white/10 text-white/80 backdrop-blur"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ delay: reduced ? 0 : 0.45, duration: 0.25 }}
          >
            <X size={20} aria-hidden />
          </motion.button>

          {/* Волна 3: лист выплывает из размытия */}
          <div className="relative flex min-h-dvh items-start justify-center px-4 py-[max(4.5rem,calc(env(safe-area-inset-top)+3.5rem))]">
            <motion.article
              className="paper w-full max-w-md rounded-[26px] px-7 pt-9 pb-10"
              // Просим браузер заранее вынести лист на отдельный слой:
              // тогда движение считает видеокарта, а не основной поток.
              style={{ willChange: "transform, opacity" }}
              initial={
                reduced
                  ? { opacity: 0 }
                  : { opacity: 0, scale: 0.94, y: 22 }
              }
              animate={
                reduced ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }
              }
              exit={
                reduced ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: 10 }
              }
              transition={{
                delay: reduced ? 0 : 0.14,
                duration: reduced ? 0.15 : 0.48,
                ease: EASE,
              }}
            >
              <Letter
                item={item}
                authorName={authorName}
                isMine={isMine}
                reduced={reduced}
              />
            </motion.article>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}

function Letter({
  item,
  authorName,
  isMine,
  reduced,
}: {
  item: DiaryItem;
  authorName: string;
  isMine: boolean;
  reduced: boolean;
}) {
  const content = item.content!;
  const body = content.body.trim();

  // Текст начинаем проявлять не сразу, а когда лист уже долетел.
  // Состояние живёт здесь, а не выше: при закрытии письма компонент
  // исчезает вместе с ним, и в следующий раз всё начинается заново.
  const [settled, setSettled] = useState(reduced);

  useEffect(() => {
    if (reduced) return;
    const id = window.setTimeout(() => setSettled(true), 480);
    return () => window.clearTimeout(id);
  }, [reduced]);

  const { nodeRef, done, reveal } = useTypewriter(body, {
    start: settled,
    enabled: !reduced,
  });

  return (
    <div onClick={() => !done && reveal()}>
      <p className="paper-muted text-center text-[11px] tracking-[0.22em] uppercase">
        {new Date(item.entry_date).toLocaleDateString("ru-RU", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
      </p>

      <h1 className="mt-4 text-center font-display text-[26px] leading-snug">
        {content.title}
      </h1>

      {content.mood && (
        <p className="mt-2 text-center text-xl" aria-hidden>
          {content.mood}
        </p>
      )}

      <div className="paper-rule mx-auto mt-6 h-px w-24" />

      {/*
        Голос выше текста: если письмо записано голосом, слушать его надо
        сразу, а не докручивать страницу вниз. Нажатие сюда не должно
        запускать проявление текста, поэтому останавливаем его здесь.
      */}
      {item.audioUrl && content.audio_seconds && (
        <div
          className="mt-7 rounded-2xl bg-[#3d2f22]/[0.06] p-3"
          onClick={(event) => event.stopPropagation()}
        >
          <VoicePlayer
            src={item.audioUrl}
            seconds={content.audio_seconds}
            tone="paper"
          />
        </div>
      )}

      {body && (
        <p
          className="mt-7 text-[23px] leading-[1.75] font-hand whitespace-pre-wrap"
          // Пока текст проявляется, читатель видит незаконченную фразу.
          // Для чтения с экрана это шум, поэтому туда отдаём сразу целиком.
          aria-label={body}
        >
          {/* Сюда текст пишется напрямую, минуя React: перерисовка
              на каждом кадре и была причиной рывков. */}
          <span ref={nodeRef} aria-hidden />
          {!done && (
            <span
              aria-hidden
              className="caret ml-0.5 inline-block h-[1.1em] w-px translate-y-[0.15em] bg-current"
            />
          )}
        </p>
      )}

      <p className="paper-muted mt-9 text-right text-[19px] font-hand">
        {isMine ? "твой " : ""}
        {authorName} ♡
      </p>

      {!done && body && (
        <p className="paper-muted mt-6 text-center text-[12px]">
          нажми, чтобы показать целиком
        </p>
      )}
    </div>
  );
}
