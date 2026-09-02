"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

/**
 * Постепенное проявление текста, как будто его пишут прямо сейчас.
 *
 * Важное решение: текст пишется прямо в DOM через ссылку на элемент,
 * а не через состояние React. Раньше на каждом кадре вызывался setState,
 * то есть шестьдесят перерисовок в секунду на длинном абзаце — от этого
 * и проседал FPS. Теперь React перерисовывает компонент один раз, когда
 * текст дописан.
 *
 * Считаем время, а не кадры: на медленном телефоне текст проявится за те же
 * секунды, просто менее плавно.
 */
export function useTypewriter(
  text: string,
  { start, enabled }: { start: boolean; enabled: boolean },
) {
  const nodeRef = useRef<HTMLSpanElement>(null);
  const frame = useRef<number | undefined>(undefined);
  const [finished, setFinished] = useState(false);

  /** Показать всё сразу — по нажатию на письмо. */
  const reveal = useCallback(() => {
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    if (nodeRef.current) nodeRef.current.textContent = text;
    setFinished(true);
  }, [text]);

  useEffect(() => {
    if (!start) return;

    if (!enabled) {
      // Движение выключено в системе — просто ставим текст на место.
      // Состояние здесь не трогаем: оно выводится ниже из enabled.
      if (nodeRef.current) nodeRef.current.textContent = text;
      return;
    }

    // Целимся в 2.5–7 секунд независимо от длины.
    const duration = Math.min(7000, Math.max(2500, text.length * 22));
    const startedAt = performance.now();

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const node = nodeRef.current;

      if (node) {
        node.textContent = text.slice(0, Math.round(progress * text.length));
      }

      if (progress < 1) {
        frame.current = requestAnimationFrame(tick);
      } else {
        setFinished(true);
      }
    };

    frame.current = requestAnimationFrame(tick);

    return () => {
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    };
  }, [text, start, enabled]);

  return { nodeRef, done: start && (!enabled || finished), reveal };
}

/*
  Системная настройка «меньше движения» — внешнее состояние, поэтому читаем
  её штатным хуком, а не эффектом с setState.
*/
const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeToMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const motionSnapshot = () => window.matchMedia(REDUCED_QUERY).matches;

/** На сервере медиазапросов нет — считаем, что движение разрешено. */
const motionServerSnapshot = () => false;

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeToMotion,
    motionSnapshot,
    motionServerSnapshot,
  );
}
