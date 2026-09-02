"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { DrawingCanvas } from "@/components/games/DrawingCanvas";
import { Button } from "@/components/ui/Button";
import {
  requestDrawingUpload,
  submitOrderDrawing,
} from "@/app/(app)/games/draw/actions";

/**
 * Холст для заказа.
 *
 * Отдельно от DrawingComposer намеренно: там половина работы — выбрать
 * задание и спрятать его, а здесь задание уже дано и открыто. Общее у них
 * только полотно, и оно вынесено в DrawingCanvas.
 */
export function OrderDrawing({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // Холст отдаёт сюда способ забрать картинку, когда она понадобится.
  const getBlobRef = useRef<(() => Promise<Blob | null>) | null>(null);
  const onReady = useCallback((getBlob: () => Promise<Blob | null>) => {
    getBlobRef.current = getBlob;
  }, []);

  async function send() {
    setError(null);

    const blob = await getBlobRef.current?.();
    if (!blob) {
      setError("Сначала нарисуйте что-нибудь.");
      return;
    }

    setSending(true);

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

      const result = await submitOrderDrawing(orderId, target.key);
      if (result.error) throw new Error(result.error);

      router.push("/games/draw");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось отправить.");
      setSending(false);
    }
  }

  return (
    <div className="mt-4">
      <DrawingCanvas onReady={onReady} />

      {error && (
        <p role="status" className="mt-3 text-[14px] text-danger">
          {error}
        </p>
      )}

      <div className="mt-4">
        <Button size="lg" block disabled={sending} onClick={send}>
          {sending ? "Отправляем…" : "Готово"}
        </Button>
      </div>
    </div>
  );
}
