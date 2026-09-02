"use client";

import { useRef, useState } from "react";
import { Heart, Pause, Play, Volume2, VolumeX } from "lucide-react";

/**
 * Свой проигрыватель вместо стандартного.
 *
 * Кнопки Safari мелкие, чужие по стилю и ложатся поверх кадра.
 * Здесь панель вынесена под видео: она ничего не закрывает,
 * а значит её не нужно ни прятать, ни возвращать по касанию.
 */

const pad = (n: number) => String(Math.floor(n)).padStart(2, "0");

/** «1:23» — время в привычном виде. */
function clock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  return `${Math.floor(seconds / 60)}:${pad(seconds % 60)}`;
}

export function VideoPlayer({
  src,
  poster,
}: {
  src: string;
  poster?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);

  function toggle() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  }

  /** Позиция касания на полоске → секунды. */
  function seekTo(clientX: number) {
    const track = trackRef.current;
    const video = videoRef.current;
    if (!track || !video || !Number.isFinite(video.duration)) return;

    const rect = track.getBoundingClientRect();
    const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);

    video.currentTime = ratio * video.duration;
    setTime(video.currentTime);
  }

  const percent = duration > 0 ? (time / duration) * 100 : 0;

  return (
    <div className="flex size-full flex-col">
      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        <video
          ref={videoRef}
          src={src}
          poster={poster}
          // playsInline обязателен: без него iOS вырывает видео
          // в собственный полноэкранный плеер поверх приложения
          playsInline
          preload="metadata"
          className="max-h-full max-w-full rounded-3xl"
          onClick={toggle}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onTimeUpdate={(e) => {
            if (!scrubbing) setTime(e.currentTarget.currentTime);
          }}
          onLoadedMetadata={(e) => {
            const value = e.currentTarget.duration;
            if (Number.isFinite(value)) setDuration(value);
          }}
        />

        {/* Крупная кнопка по центру, пока видео на паузе */}
        {!playing && (
          <button
            type="button"
            onClick={toggle}
            aria-label="Воспроизвести"
            className="absolute flex size-16 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-md transition-transform active:scale-95"
          >
            <Play size={26} fill="currentColor" className="ml-1" aria-hidden />
          </button>
        )}
      </div>

      {/* Панель под видео — кадр остаётся полностью видимым */}
      <div className="mt-3 flex shrink-0 items-center gap-2.5 rounded-full bg-white/8 px-2 py-1.5 backdrop-blur-md">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? "Пауза" : "Воспроизвести"}
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-white active:bg-white/10"
        >
          {playing ? (
            <Pause size={16} fill="currentColor" aria-hidden />
          ) : (
            <Play size={16} fill="currentColor" className="ml-0.5" aria-hidden />
          )}
        </button>

        <span className="tabular w-8 shrink-0 text-[12px] text-white/60">
          {clock(time)}
        </span>

        {/* Полоска перемотки: сердечко вместо обычного ползунка */}
        <div
          ref={trackRef}
          role="slider"
          aria-label="Перемотка"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(time)}
          aria-valuetext={clock(time)}
          tabIndex={0}
          // Линия тонкая, но брать её пальцем нужно легко —
          // поэтому вокруг невидимый запас по высоте.
          className="relative flex h-10 flex-1 cursor-pointer touch-none items-center"
          onPointerDown={(e) => {
            // Перемотка первым делом: захват указателя нужен только для
            // продолжения жеста, и если он не удастся, само нажатие
            // всё равно должно сработать.
            setScrubbing(true);
            seekTo(e.clientX);
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              // Некоторые браузеры отказывают в захвате — не страшно.
            }
          }}
          onPointerMove={(e) => {
            if (scrubbing) seekTo(e.clientX);
          }}
          onPointerUp={() => setScrubbing(false)}
          onPointerCancel={() => setScrubbing(false)}
          onKeyDown={(e) => {
            const video = videoRef.current;
            if (!video) return;
            if (e.key === "ArrowRight") video.currentTime += 5;
            if (e.key === "ArrowLeft") video.currentTime -= 5;
          }}
        >
          <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/20">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${percent}%` }}
            />
          </div>

          <span
            aria-hidden
            className="pointer-events-none absolute top-1/2 text-accent transition-transform duration-150"
            style={{
              left: `${percent}%`,
              transform: `translate(-50%, -50%) scale(${scrubbing ? 1.4 : 1})`,
            }}
          >
            <Heart
              size={14}
              fill="currentColor"
              strokeWidth={0}
              className="drop-shadow-[0_1px_4px_rgba(0,0,0,0.7)]"
            />
          </span>
        </div>

        <span className="tabular w-8 shrink-0 text-right text-[12px] text-white/60">
          {clock(duration)}
        </span>

        <button
          type="button"
          onClick={() => {
            const video = videoRef.current;
            if (!video) return;
            video.muted = !video.muted;
            setMuted(video.muted);
          }}
          aria-label={muted ? "Включить звук" : "Выключить звук"}
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-white active:bg-white/10"
        >
          {muted ? (
            <VolumeX size={16} aria-hidden />
          ) : (
            <Volume2 size={16} aria-hidden />
          )}
        </button>
      </div>
    </div>
  );
}
