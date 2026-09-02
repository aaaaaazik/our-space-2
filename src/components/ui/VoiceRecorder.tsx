"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, Trash2 } from "lucide-react";

import { formatSeconds, VoicePlayer } from "@/components/ui/VoicePlayer";
import { cn } from "@/lib/utils/cn";

/** Дольше пяти минут — это уже не записка, а разговор. */
export const MAX_SECONDS = 300;

/**
 * Форматы по убыванию предпочтения.
 *
 * mp4 первым намеренно. Safari умеет записывать только его, но что важнее —
 * Safari не умеет ПРОИГРЫВАТЬ webm. Если бы Chrome на компьютере записал
 * webm, на айфоне такое письмо не открылось бы вовсе. Поэтому mp4 берём
 * везде, где он есть, и webm остаётся запасным вариантом.
 */
const FORMATS = [
  "audio/mp4",
  "audio/aac",
  "audio/webm;codecs=opus",
  "audio/webm",
];

function pickFormat(): string | null {
  if (typeof MediaRecorder === "undefined") return null;

  for (const format of FORMATS) {
    if (MediaRecorder.isTypeSupported(format)) return format;
  }

  // Пустая строка — «решай сам»: некоторые сборки не отвечают на проверку
  // формата, но записывать при этом умеют.
  return "";
}

export type Recording = {
  blob: Blob;
  seconds: number;
  /**
   * Ссылка на запись для прослушивания до отправки.
   *
   * Создаётся один раз, когда запись готова, и живёт вместе с ней.
   * Делать её прямо в разметке нельзя: браузер выдавал бы новую ссылку
   * при каждой перерисовке, и все прежние оставались бы висеть в памяти.
   */
  url: string;
};

/**
 * Диктофон: записать, послушать, перезаписать.
 *
 * Готовая запись не уходит никуда сама — она отдаётся наверх, и решение
 * сохранить её принимает форма, вместе со всем остальным письмом.
 */
export function VoiceRecorder({
  value,
  onChange,
}: {
  value: Recording | null;
  onChange: (recording: Recording | null) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const urlRef = useRef<string | null>(null);

  // Микрофон нужно отпускать явно, иначе на телефоне остаётся гореть
  // значок записи, даже когда приложение уже закрыли.
  const stopStream = () => {
    recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    recorderRef.current = null;
  };

  const dropUrl = () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
  };

  useEffect(
    () => () => {
      stopStream();
      dropUrl();
    },
    [],
  );

  // Секундомер. Считаем от отметки времени, а не прибавляем по единице:
  // вкладку могут свернуть, и таймеры в фоне идут медленнее настоящих часов.
  useEffect(() => {
    if (!recording) return;

    const id = window.setInterval(() => {
      const passed = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setSeconds(passed);
      if (passed >= MAX_SECONDS) recorderRef.current?.stop();
    }, 250);

    return () => window.clearInterval(id);
  }, [recording]);

  async function start() {
    setError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Этот браузер не умеет записывать звук.");
      return;
    }

    const format = pickFormat();
    if (format === null) {
      setError("Этот браузер не умеет записывать звук.");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Нет доступа к микрофону. Разрешите его в настройках браузера.");
      return;
    }

    const recorder = new MediaRecorder(
      stream,
      format ? { mimeType: format } : undefined,
    );

    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    recorder.onstop = () => {
      const passed = Math.max(
        1,
        Math.min(
          MAX_SECONDS,
          Math.round((Date.now() - startedAtRef.current) / 1000),
        ),
      );

      const blob = new Blob(chunksRef.current, {
        type: recorder.mimeType || "audio/mp4",
      });

      stopStream();
      setRecording(false);

      if (blob.size === 0) return;

      // Прежняя запись, если перезаписывали, больше не нужна.
      dropUrl();
      urlRef.current = URL.createObjectURL(blob);

      onChange({ blob, seconds: passed, url: urlRef.current });
    };

    recorderRef.current = recorder;
    startedAtRef.current = Date.now();
    setSeconds(0);
    setRecording(true);
    recorder.start();
  }

  function stop() {
    recorderRef.current?.stop();
  }

  function drop() {
    dropUrl();
    onChange(null);
    setSeconds(0);
  }

  if (value) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-3">
        <VoicePlayer src={value.url} seconds={value.seconds} />

        <div className="mt-2.5 flex items-center gap-4">
          <button
            type="button"
            onClick={start}
            className="text-[13px] text-accent"
          >
            Записать заново
          </button>
          <button
            type="button"
            onClick={drop}
            className="flex items-center gap-1 text-[13px] text-text-faint"
          >
            <Trash2 size={13} aria-hidden />
            Убрать
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={recording ? stop : start}
        className={cn(
          "flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border",
          "text-[15px] transition-colors",
          recording
            ? "border-danger/45 bg-danger/10 text-danger"
            : "border-border bg-surface text-text",
        )}
      >
        {recording ? (
          <>
            <Square size={15} fill="currentColor" aria-hidden />
            Остановить · {formatSeconds(seconds)}
          </>
        ) : (
          <>
            <Mic size={17} aria-hidden />
            Записать голосом
          </>
        )}
      </button>

      {recording && (
        <p className="mt-1.5 text-center text-[12px] text-text-faint">
          не больше {Math.round(MAX_SECONDS / 60)} минут
        </p>
      )}

      {error && (
        <p role="status" className="mt-1.5 text-[13px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
