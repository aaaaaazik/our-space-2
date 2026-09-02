"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Shuffle } from "lucide-react";

import { DrawingCanvas } from "@/components/games/DrawingCanvas";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { cn } from "@/lib/utils/cn";
import {
  createRound,
  requestDrawingUpload,
} from "@/app/(app)/games/draw/actions";
import { pickPrompt } from "@/lib/games/drawingPrompts";

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "error"; message: string };

export function DrawingComposer({ initialPrompt }: { initialPrompt: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"random" | "own">("random");
  const [prompt, setPrompt] = useState(initialPrompt);
  const [ownWord, setOwnWord] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  // Холст отдаёт сюда способ забрать картинку, когда она понадобится.
  const getBlobRef = useRef<(() => Promise<Blob | null>) | null>(null);
  const onReady = useCallback((getBlob: () => Promise<Blob | null>) => {
    getBlobRef.current = getBlob;
  }, []);

  async function send() {
    const word = mode === "own" ? ownWord.trim() : prompt;

    if (mode === "own" && word.length < 2) {
      setStatus({ kind: "error", message: "Впишите слово, которое рисуете." });
      return;
    }

    const blob = await getBlobRef.current?.();

    if (!blob) {
      setStatus({ kind: "error", message: "Сначала нарисуйте что-нибудь." });
      return;
    }

    setStatus({ kind: "sending" });

    try {
      const target = await requestDrawingUpload();
      if ("error" in target) throw new Error(target.error);

      const response = await fetch(target.url, {
        method: "PUT",
        body: blob,
        headers: { "Content-Type": "image/png" },
      });

      if (!response.ok) {
        throw new Error(`хранилище ответило ${response.status}`);
      }

      const result = await createRound({ key: target.key, prompt: word });
      if (result.error) throw new Error(result.error);

      router.push("/games/draw");
      router.refresh();
    } catch (error) {
      setStatus({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Не удалось отправить.",
      });
    }
  }

  const sending = status.kind === "sending";

  return (
    <div>
      <div className="rounded-3xl border border-accent/25 bg-accent-soft/30 p-4">
        <div className="flex gap-1.5">
          <ModeButton
            active={mode === "random"}
            onClick={() => setMode("random")}
          >
            Задание
          </ModeButton>
          <ModeButton active={mode === "own"} onClick={() => setMode("own")}>
            Своё слово
          </ModeButton>
        </div>

        {mode === "random" ? (
          <div className="mt-3 flex items-start justify-between gap-3">
            <p className="font-display text-[22px] leading-snug text-text">
              {prompt}
            </p>

            <button
              type="button"
              aria-label="Другое задание"
              onClick={() => setPrompt(pickPrompt(prompt))}
              disabled={sending}
              className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-border bg-surface text-text-muted active:bg-surface-2"
            >
              <Shuffle size={16} aria-hidden />
            </button>
          </div>
        ) : (
          <div className="mt-3">
            <Input
              value={ownWord}
              onChange={(e) => setOwnWord(e.target.value)}
              maxLength={40}
              autoComplete="off"
              placeholder="Что рисуем?"
              aria-label="Своё слово"
            />
          </div>
        )}

        <p className="mt-2.5 text-[13px] text-text-muted">
          Второй увидит только рисунок — слово останется скрытым, пока он
          не ответит.
        </p>
      </div>

      <div className="mt-4">
        <DrawingCanvas onReady={onReady} />
      </div>

      {status.kind === "error" && (
        <p role="status" className="mt-3 text-[14px] text-danger">
          {status.message}
        </p>
      )}

      <Button
        size="lg"
        block
        className="mt-4"
        onClick={send}
        disabled={sending}
      >
        {sending ? "Отправляем…" : "Готово, отправить"}
      </Button>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "min-h-9 rounded-full px-3.5 text-[13px] font-medium transition-colors",
        active
          ? "bg-accent text-on-accent"
          : "border border-border bg-surface text-text-muted",
      )}
    >
      {children}
    </button>
  );
}
