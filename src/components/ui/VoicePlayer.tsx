"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

/** «1:07» */
export function formatSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.max(0, Math.round(seconds)) % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Проигрыватель голосовой записи: кнопка, полоса и время.
 *
 * Длительность приходит числом снаружи, а не берётся из файла. У записи,
 * сделанной браузером на ходу, продолжительность внутри файла часто не
 * проставлена — браузер отвечает «бесконечность», и подписать кнопку
 * оказывается нечем.
 */
export function VoicePlayer({
  src,
  seconds,
  tone = "dark",
}: {
  src: string;
  /** Длительность записи, посчитанная диктофоном. */
  seconds: number;
  /** На бумаге письма нужны тёмные чернила, в остальном приложении — светлые. */
  tone?: "dark" | "paper";
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [passed, setPassed] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => setPassed(audio.currentTime);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnd = () => {
      setPlaying(false);
      setPassed(0);
      audio.currentTime = 0;
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnd);

    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnd);
    };
  }, []);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      // play() возвращает обещание, и Safari отклоняет его, если нажатие
      // не распознано как жест человека. Ошибку глотаем: показывать
      // «не удалось» тут нечего, кнопка просто останется в покое.
      audio.play().catch(() => setPlaying(false));
    } else {
      audio.pause();
    }
  }

  const share = seconds > 0 ? Math.min(1, passed / seconds) : 0;
  const paper = tone === "paper";

  return (
    <div className="flex items-center gap-3">
      {/* preload=metadata: сам звук не качаем, пока не нажали. */}
      <audio ref={audioRef} src={src} preload="metadata" />

      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Пауза" : "Слушать"}
        className={
          "flex size-10 shrink-0 items-center justify-center rounded-full transition-transform active:scale-95 " +
          (paper
            ? "bg-[#3d2f22] text-[#f4ecdd]"
            : "bg-accent text-on-accent")
        }
      >
        {playing ? (
          <Pause size={16} fill="currentColor" aria-hidden />
        ) : (
          // Треугольник чуть правее середины: у кнопки «играть» оптический
          // центр не совпадает с геометрическим.
          <Play size={16} fill="currentColor" className="ml-0.5" aria-hidden />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div
          className={
            "h-1 overflow-hidden rounded-full " +
            (paper ? "bg-[#3d2f22]/20" : "bg-border")
          }
        >
          <div
            className={
              "h-full rounded-full transition-[width] duration-200 ease-linear " +
              (paper ? "bg-[#3d2f22]" : "bg-accent")
            }
            style={{ width: `${share * 100}%` }}
          />
        </div>

        <p
          className={
            "mt-1.5 text-[12px] tabular-nums " +
            (paper ? "paper-muted" : "text-text-faint")
          }
        >
          {formatSeconds(playing || passed > 0 ? passed : seconds)}
          {passed > 0 && ` / ${formatSeconds(seconds)}`}
        </p>
      </div>
    </div>
  );
}
