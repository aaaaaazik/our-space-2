"use client";

import { useEffect, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";

/**
 * Модальное окно, выезжающее снизу — как системные окна iOS.
 * Закрывается тапом по фону, кнопкой и свайпом вниз.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  // Пока окно открыто, страница под ним не должна прокручиваться.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Escape — для десктопа.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <motion.div
            className="absolute inset-0 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="relative flex max-h-[90dvh] w-full flex-col rounded-t-3xl bg-surface shadow-sheet sm:max-w-lg sm:rounded-3xl"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 34, stiffness: 380 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 700) onClose();
            }}
          >
            <div className="flex shrink-0 flex-col items-center pt-2.5">
              <div className="h-1 w-9 rounded-full bg-border-strong" />
            </div>

            <div className="flex shrink-0 items-center justify-between px-5 pt-3 pb-2">
              <h2 className="font-display text-xl text-text">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                className="-mr-2 min-h-11 px-2 text-[15px] text-text-muted"
              >
                Готово
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-2">
              {children}
            </div>

            {footer && (
              <div className="shrink-0 border-t border-border px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
                {footer}
              </div>
            )}

            {!footer && <div className="h-[max(1rem,env(safe-area-inset-bottom))]" />}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
