"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import imageCompression from "browser-image-compression";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { MAX_UPLOAD_BYTES } from "@/lib/media/shared";
import {
  registerMedia,
  requestUploadUrl,
} from "@/app/(app)/memories/actions";

/** Подготовка — сжатие фото или снятие кадра с видео; отправка — сама заливка. */
type Stage = "prepare" | "upload";

type Status =
  | { kind: "idle" }
  | {
      kind: "working";
      done: number;
      total: number;
      stage: Stage;
      percent: number;
    }
  | { kind: "error"; message: string };

const mb = (bytes: number) => Math.round(bytes / (1024 * 1024));

/** Размеры готового изображения — нужны для аккуратной сетки. */
function imageSize(file: Blob) {
  return new Promise<{ width: number | null; height: number | null }>(
    (resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
        URL.revokeObjectURL(url);
      };
      img.onerror = () => {
        resolve({ width: null, height: null });
        URL.revokeObjectURL(url);
      };
      img.src = url;
    },
  );
}

type VideoMeta = {
  poster: Blob | null;
  width: number | null;
  height: number | null;
  duration: number | null;
};

const NO_META: VideoMeta = {
  poster: null,
  width: null,
  height: null,
  duration: null,
};

/** Сколько ждём кадр, прежде чем загрузить видео без обложки. */
const POSTER_TIMEOUT_MS = 12_000;

/**
 * Первый кадр видео — обложка для сетки: браузеры не рисуют превью сами.
 *
 * Написано с оглядкой на Safari, где всё хрупко:
 *   • элемент должен быть в документе, иначе iOS может не начать декодирование;
 *   • нужен preload="auto" — по одним метаданным кадра ещё нет;
 *   • событие seeked иногда не приходит, поэтому слушаем и timeupdate;
 *   • на всё есть предел ожидания. Без него зависшее событие означало бы
 *     вечную загрузку — ровно так эта функция и вела себя раньше.
 *
 * Не получилось снять кадр — не беда: видео загрузится без обложки,
 * в сетке у него будет значок воспроизведения.
 */
function videoPoster(file: File): Promise<VideoMeta> {
  return new Promise<VideoMeta>((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");

    video.preload = "auto";
    video.muted = true;
    video.defaultMuted = true;
    // playsInline обязателен: иначе iOS вырывает видео в полноэкранный плеер
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("muted", "");
    video.crossOrigin = "anonymous";

    // Элемент прячем, но оставляем в документе — Safari требует этого,
    // чтобы вообще начать декодировать кадры.
    video.style.cssText =
      "position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none";
    document.body.appendChild(video);

    let settled = false;

    const finish = (result: VideoMeta) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      video.remove();
      URL.revokeObjectURL(url);
      resolve(result);
    };

    const timer = setTimeout(() => {
      finish({
        ...NO_META,
        duration: Number.isFinite(video.duration) ? video.duration : null,
        width: video.videoWidth || null,
        height: video.videoHeight || null,
      });
    }, POSTER_TIMEOUT_MS);

    const capture = () => {
      if (settled || !video.videoWidth) return;

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const context = canvas.getContext("2d");
      if (!context) {
        finish(NO_META);
        return;
      }

      const meta = {
        width: video.videoWidth,
        height: video.videoHeight,
        duration: Number.isFinite(video.duration) ? video.duration : null,
      };

      try {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
      } catch {
        finish({ ...meta, poster: null });
        return;
      }

      canvas.toBlob(
        (blob) => finish({ ...meta, poster: blob }),
        "image/jpeg",
        0.8,
      );
    };

    video.addEventListener("loadedmetadata", () => {
      // Нулевой кадр часто чёрный, поэтому отматываем чуть вперёд.
      const target = Math.min(0.4, (video.duration || 1) / 4);
      try {
        video.currentTime = target;
      } catch {
        capture();
      }
    });

    video.addEventListener("seeked", capture);
    video.addEventListener("timeupdate", capture);
    video.addEventListener("loadeddata", capture);
    video.addEventListener("error", () => finish(NO_META));

    video.src = url;
    video.load();
  });
}

/** Заливка прямо в хранилище с отслеживанием прогресса. */
function putFile(url: string, body: Blob, type: string, onProgress: (p: number) => void) {
  return new Promise<void>((resolve, reject) => {
    // fetch не умеет сообщать прогресс отправки, поэтому здесь XHR.
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`хранилище ответило ${xhr.status}`));
    // Браузер не сообщает причину сетевой ошибки, поэтому показываем адрес —
    // по нему сразу видно, если в настройках опечатка.
    xhr.onerror = () =>
      reject(new Error(`нет связи с ${new URL(url).hostname}`));
    xhr.send(body);
  });
}

export function PhotoUploader({ albumId }: { albumId?: string | null }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function upload(
    file: File,
    report: (stage: Stage, percent: number) => void,
  ) {
    const isVideo = file.type.startsWith("video/");
    report("prepare", 0);

    let body: Blob;
    let type: string;
    let width: number | null = null;
    let height: number | null = null;
    let duration: number | null = null;
    let posterBlob: Blob | null = null;

    if (isVideo) {
      if (file.size > MAX_UPLOAD_BYTES) {
        throw new Error(
          `видео весит ${mb(file.size)} МБ, а можно до ${mb(MAX_UPLOAD_BYTES)} МБ`,
        );
      }
      body = file;
      type = file.type;
      const meta = await videoPoster(file);
      posterBlob = meta.poster;
      width = meta.width;
      height = meta.height;
      duration = meta.duration;
    } else {
      // iPhone снимает в HEIC, который браузеры не показывают.
      // Сжатие через canvas заодно превращает файл в JPEG.
      body = await imageCompression(file, {
        maxSizeMB: 1.6,
        maxWidthOrHeight: 2400,
        useWebWorker: true,
        fileType: "image/jpeg",
        initialQuality: 0.82,
      });
      type = "image/jpeg";
      const size = await imageSize(body);
      width = size.width;
      height = size.height;
    }

    const target = await requestUploadUrl(type);
    if ("error" in target) throw new Error(target.error);

    await putFile(target.url, body, type, (percent) =>
      report("upload", percent),
    );

    let posterKey: string | null = null;
    if (posterBlob) {
      const posterTarget = await requestUploadUrl("image/jpeg");
      if (!("error" in posterTarget)) {
        await putFile(posterTarget.url, posterBlob, "image/jpeg", () => {});
        posterKey = posterTarget.key;
      }
    }

    const result = await registerMedia({
      key: target.key,
      kind: isVideo ? "video" : "photo",
      mimeType: type,
      sizeBytes: body.size,
      width,
      height,
      durationSeconds: duration,
      posterKey,
      albumId: albumId ?? null,
      takenAt: new Date(file.lastModified || Date.now()).toISOString(),
    });

    if (result.error) throw new Error(result.error);
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;

    const files = Array.from(fileList);
    setStatus({
      kind: "working",
      done: 0,
      total: files.length,
      stage: "prepare",
      percent: 0,
    });

    for (const [index, file] of files.entries()) {
      try {
        await upload(file, (stage, percent) =>
          setStatus({
            kind: "working",
            done: index,
            total: files.length,
            stage,
            percent,
          }),
        );
      } catch (error) {
        setStatus({
          kind: "error",
          message:
            error instanceof Error
              ? `${file.name}: ${error.message}`
              : "Не удалось загрузить файл.",
        });
        if (inputRef.current) inputRef.current.value = "";
        router.refresh();
        return;
      }
    }

    if (inputRef.current) inputRef.current.value = "";
    setStatus({ kind: "idle" });
    router.refresh();
  }

  const busy = status.kind === "working";

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        // image/*,video/* + multiple — Safari на iPhone показывает
        // выбор нескольких файлов прямо из галереи.
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      <Button
        size="md"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        aria-label="Добавить фото или видео"
      >
        {busy ? (
          <span className="tabular">
            {status.total > 1 && `${status.done + 1}/${status.total} · `}
            {status.stage === "prepare"
              ? "готовим…"
              : `${Math.round(status.percent * 100)}%`}
          </span>
        ) : (
          <>
            <Plus size={18} aria-hidden />
            Добавить
          </>
        )}
      </Button>

      {status.kind === "error" && (
        <p role="status" className="mt-2 max-w-56 text-[13px] text-danger">
          {status.message}
        </p>
      )}
    </div>
  );
}
