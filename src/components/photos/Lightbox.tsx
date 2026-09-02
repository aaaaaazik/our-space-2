"use client";

import { useCallback, useEffect, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  ChevronLeft,
  ChevronRight,
  Heart,
  MessageCircle,
  Pencil,
  X,
} from "lucide-react";

import { toggleReaction } from "@/app/(app)/memories/actions";
import type { MediaItem } from "@/lib/media/shared";
import type { Album, Profile } from "@/types/database";

import { MediaComments } from "./MediaComments";
import { MediaEditor } from "./MediaEditor";
import { VideoPlayer } from "./VideoPlayer";

/**
 * Полноэкранный просмотр.
 * Свайп влево/вправо — соседний файл, свайп вниз — закрыть.
 */
export function Lightbox({
  items,
  albums,
  profiles,
  currentUserId,
  index,
  onIndexChange,
  onClose,
}: {
  items: MediaItem[];
  albums: Album[];
  profiles: Profile[];
  currentUserId: string;
  index: number | null;
  onIndexChange: (next: number) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [showComments, setShowComments] = useState(false);
  const [showEditor, setShowEditor] = useState(false);

  const open = index !== null;
  const item = open ? items[index] : undefined;

  const go = useCallback(
    (delta: number) => {
      if (index === null) return;
      const next = index + delta;
      if (next >= 0 && next < items.length) onIndexChange(next);
    },
    [index, items.length, onIndexChange],
  );

  useEffect(() => {
    if (!open) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") go(1);
      if (event.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, go]);

  const authorName = (id: string) =>
    profiles.find((p) => p.id === id)?.display_name ?? "—";

  return (
    <AnimatePresence>
      {open && item && (
        <motion.div
          className="fixed inset-0 z-50 flex flex-col bg-black"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 z-10 flex size-11 items-center justify-center rounded-full bg-white/12 text-white backdrop-blur"
          >
            <X size={20} aria-hidden />
          </button>

          {/* Переход к соседнему файлу. Для фотографий есть ещё и свайп,
              для видео это единственный способ. */}
          {index > 0 && (
            <NavButton side="left" onClick={() => go(-1)} label="Предыдущее" />
          )}
          {index < items.length - 1 && (
            <NavButton side="right" onClick={() => go(1)} label="Следующее" />
          )}

          <motion.div
            key={item.id}
            // Отступы по бокам нужны, чтобы скруглённые углы кадра
            // не упирались в края экрана.
            className="flex min-h-0 flex-1 items-center justify-center px-3 pt-[max(4rem,calc(env(safe-area-inset-top)+3rem))] pb-2"
            // Видео не листается свайпом: жест перетаскивания перехватывал бы
            // нажатия на полоске перемотки, и она переставала работать.
            // Для перехода к соседнему файлу есть кнопки по краям.
            drag={item.kind === "photo"}
            dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
            dragElastic={0.55}
            onDragEnd={(_, info) => {
              const { x, y } = info.offset;
              if (y > 130 && Math.abs(y) > Math.abs(x)) onClose();
              else if (x < -70) go(1);
              else if (x > 70) go(-1);
            }}
            initial={{ opacity: 0.4 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 }}
          >
            {item.kind === "video" ? (
              item.url ? (
                <VideoPlayer
                  key={item.url}
                  src={item.url}
                  poster={item.posterUrl ?? undefined}
                />
              ) : (
                <Unavailable />
              )
            ) : item.url ? (
              /*
                Паспарту вокруг снимка.

                Фотография лежит на светлом поле с тонкой золотистой
                каймой — как карточка в альбоме. Поле само подгоняется
                под снимок: max-w-fit прижимает рамку к картинке, иначе
                у вертикальных фотографий оставались бы пустые борта.
              */
              <div className="max-h-full max-w-fit rounded-[26px] bg-[#f7f2ea] p-2.5 shadow-[0_18px_50px_rgba(0,0,0,0.55)] ring-1 ring-[#d9c9a8]">
                <div className="overflow-hidden rounded-[18px] ring-1 ring-black/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.url}
                    alt={item.title ?? "Фотография"}
                    draggable={false}
                    className="max-h-[78dvh] max-w-full object-contain select-none"
                  />
                </div>
              </div>
            ) : (
              <Unavailable />
            )}
          </motion.div>

          <div className="shrink-0 px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {item.title && (
              <p className="font-display text-[19px] leading-snug text-white">
                {item.title}
              </p>
            )}

            <p
              className={
                "text-[12px] tracking-wide text-white/40 " +
                (item.title ? "mt-1" : "")
              }
            >
              {new Date(item.taken_at).toLocaleDateString("ru-RU", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
              {" · "}
              {authorName(item.uploaded_by)}
              {" · "}
              {index + 1} из {items.length}
            </p>

            {item.description && (
              <p className="mt-2 text-[15px] leading-relaxed text-white/75">
                {item.description}
              </p>
            )}

            <div className="mt-3 flex items-center gap-2">
              <LikeButton item={item} />

              <ActionButton
                label="Комментарии"
                onClick={() => setShowComments(true)}
              >
                <MessageCircle size={18} aria-hidden />
                {item.comments.length > 0 && (
                  <span className="text-[14px]">{item.comments.length}</span>
                )}
              </ActionButton>

              {item.uploaded_by === currentUserId && (
                <ActionButton
                  label="Изменить"
                  onClick={() => setShowEditor(true)}
                >
                  <Pencil size={16} aria-hidden />
                </ActionButton>
              )}
            </div>
          </div>

          <MediaComments
            open={showComments}
            onClose={() => setShowComments(false)}
            item={item}
            profiles={profiles}
            currentUserId={currentUserId}
          />

          <MediaEditor
            open={showEditor}
            onClose={() => setShowEditor(false)}
            item={item}
            albums={albums}
            onDeleted={() => {
              setShowEditor(false);
              onClose();
              router.refresh();
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function NavButton({
  side,
  onClick,
  label,
}: {
  side: "left" | "right";
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={
        "absolute top-1/2 z-10 flex size-11 -translate-y-1/2 items-center justify-center " +
        "rounded-full bg-white/10 text-white/80 backdrop-blur active:bg-white/20 " +
        (side === "left" ? "left-3" : "right-3")
      }
    >
      {side === "left" ? (
        <ChevronLeft size={20} aria-hidden />
      ) : (
        <ChevronRight size={20} aria-hidden />
      )}
    </button>
  );
}

function Unavailable() {
  return (
    <p className="px-8 text-center text-sm text-white/60">
      Не удалось загрузить файл.
    </p>
  );
}

function ActionButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex min-h-10 items-center gap-1.5 rounded-full bg-white/8 px-3.5 text-white/85 backdrop-blur-sm transition-colors active:bg-white/16"
    >
      {children}
    </button>
  );
}

/**
 * ❤️ откликается мгновенно, не дожидаясь сервера:
 * иначе на медленной связи было бы непонятно, засчиталось нажатие или нет.
 */
function LikeButton({ item }: { item: MediaItem }) {
  const [, startTransition] = useTransition();
  const [state, setOptimistic] = useOptimistic(
    { liked: item.likedByMe, count: item.likeCount },
    (_current, next: { liked: boolean; count: number }) => next,
  );

  return (
    <button
      type="button"
      aria-label={state.liked ? "Убрать отметку" : "Нравится"}
      aria-pressed={state.liked}
      className="flex min-h-10 items-center gap-1.5 rounded-full bg-white/8 px-3.5 text-white/85 backdrop-blur-sm transition-colors active:bg-white/16"
      onClick={() => {
        const formData = new FormData();
        formData.set("photo_id", item.id);
        formData.set("liked", state.liked ? "1" : "0");

        startTransition(async () => {
          setOptimistic({
            liked: !state.liked,
            count: state.count + (state.liked ? -1 : 1),
          });
          await toggleReaction(formData);
        });
      }}
    >
      <Heart
        size={18}
        fill={state.liked ? "currentColor" : "none"}
        className={
          "transition-transform " +
          (state.liked ? "scale-110 text-accent" : "")
        }
        aria-hidden
      />
      {state.count > 0 && <span className="text-[14px]">{state.count}</span>}
    </button>
  );
}
