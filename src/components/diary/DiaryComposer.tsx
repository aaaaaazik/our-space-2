"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, Plus } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { FieldGroup, Input, Textarea } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { VoiceRecorder, type Recording } from "@/components/ui/VoiceRecorder";
import {
  createDiaryEntry,
  requestVoiceUploadUrl,
  type FormState,
} from "@/app/(app)/diary/actions";
import { cn } from "@/lib/utils/cn";

const MOODS = ["😊", "🥰", "😌", "🤩", "😅", "😢", "😴"];

const DELAYS = [
  { value: "now", label: "Сразу" },
  { value: "week", label: "Через неделю" },
  { value: "month", label: "Через месяц" },
  { value: "halfyear", label: "Через полгода" },
  { value: "year", label: "Через год" },
  { value: "three", label: "Через 3 года" },
  { value: "custom", label: "Своя дата" },
] as const;

export function DiaryComposer({ partnerName }: { partnerName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mood, setMood] = useState("");
  const [delay, setDelay] = useState<string>("now");
  const [voice, setVoice] = useState<Recording | null>(null);

  // Закрытие окна живёт внутри действия, а не в useEffect: эффект вызвал бы
  // лишний проход отрисовки, и React справедливо на это ругается.
  const [state, action, pending] = useActionState<FormState, FormData>(
    async (prev, formData) => {
      // Голос уходит в хранилище до сохранения письма, и в форму
      // подставляется только ключ файла. Через сервер сам звук не идёт:
      // тот же путь, что у фотографий и видео.
      if (voice) {
        const uploaded = await uploadVoice(voice);
        if ("error" in uploaded) return { error: uploaded.error };

        formData.set("audio_path", uploaded.key);
        formData.set("audio_seconds", String(voice.seconds));
      }

      const result = await createDiaryEntry(prev, formData);
      if (result.ok) {
        setOpen(false);
        setMood("");
        setDelay("now");
        setVoice(null);
        router.refresh();
      }
      return result;
    },
    {},
  );

  const today = new Date().toISOString().slice(0, 10);
  const delayed = delay !== "now";

  return (
    <>
      <Button onClick={() => setOpen(true)} aria-label="Новая запись">
        <Plus size={18} aria-hidden />
        Написать
      </Button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Новая запись">
        <form action={action} id="diary-form" className="space-y-4 pt-1 pb-4">
          <FieldGroup label="Заголовок" htmlFor="diary-title">
            <Input
              id="diary-title"
              name="title"
              required
              maxLength={140}
              placeholder="Сегодня мы впервые…"
            />
          </FieldGroup>

          <FieldGroup label="Дата" htmlFor="diary-date">
            <Input
              id="diary-date"
              name="entry_date"
              type="date"
              defaultValue={today}
            />
          </FieldGroup>

          <div>
            <p className="mb-1.5 text-[13px] font-medium text-text-muted">
              Настроение
            </p>
            <input type="hidden" name="mood" value={mood} />
            <div className="flex flex-wrap gap-2">
              {MOODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMood(mood === m ? "" : m)}
                  aria-pressed={mood === m}
                  className={cn(
                    "flex size-11 items-center justify-center rounded-2xl border text-xl transition-colors",
                    mood === m
                      ? "border-accent bg-accent-soft"
                      : "border-border bg-surface",
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <FieldGroup label="Текст" htmlFor="diary-body">
            <Textarea
              id="diary-body"
              name="body"
              placeholder="Что запомнилось сегодня…"
            />
          </FieldGroup>

          <div>
            <p className="mb-1.5 text-[13px] font-medium text-text-muted">
              Голосом
            </p>
            <VoiceRecorder value={voice} onChange={setVoice} />
            <p className="mt-1.5 text-[12px] leading-snug text-text-faint">
              Можно вместо текста, можно вместе с ним. Голос запирается тем же
              таймером — раньше срока он не придёт.
            </p>
          </div>

          {/* Таймер открытия */}
          <div className="rounded-2xl border border-border bg-surface-2/50 p-3.5">
            <p className="flex items-center gap-1.5 text-[13px] font-medium text-text">
              <Clock size={14} aria-hidden />
              Когда {partnerName} это прочитает
            </p>

            <input type="hidden" name="delay" value={delay} />

            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {DELAYS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setDelay(option.value)}
                  aria-pressed={delay === option.value}
                  className={cn(
                    "min-h-9 rounded-full px-3 text-[13px] transition-colors",
                    delay === option.value
                      ? "bg-accent text-on-accent"
                      : "border border-border bg-surface text-text-muted",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {delay === "custom" && (
              <div className="mt-3">
                <Input
                  name="unlock_date"
                  type="date"
                  min={today}
                  required
                  aria-label="Дата открытия"
                />
              </div>
            )}

            {delayed && (
              <p className="mt-2.5 text-[13px] leading-relaxed text-text-muted">
                До этого момента {partnerName} увидит только запертую запись
                с отсчётом. Текст не придёт к ней на телефон — подсмотреть
                нечего.
              </p>
            )}
          </div>

          {state.error && (
            <p role="status" className="text-[15px] text-danger">
              {state.error}
            </p>
          )}
        </form>

        <div className="pb-2">
          <Button
            type="submit"
            form="diary-form"
            size="lg"
            block
            disabled={pending}
          >
            {pending
              ? voice
                ? "Отправляем голос…"
                : "Сохраняем…"
              : delayed
                ? "Запереть и сохранить"
                : "Сохранить"}
          </Button>
        </div>
      </Sheet>
    </>
  );
}

/** Заливает запись в хранилище и возвращает ключ файла. */
async function uploadVoice(
  voice: Recording,
): Promise<{ key: string } | { error: string }> {
  const type = voice.blob.type || "audio/mp4";
  const slot = await requestVoiceUploadUrl(type);

  if ("error" in slot) return slot;

  try {
    const response = await fetch(slot.url, {
      method: "PUT",
      // Тип должен совпадать с тем, под который подписана ссылка,
      // иначе хранилище отвергнет запрос: подпись включает и заголовки.
      headers: { "Content-Type": type.split(";")[0].trim() },
      body: voice.blob,
    });

    if (!response.ok) {
      return { error: `Хранилище ответило ${response.status}.` };
    }
  } catch {
    return { error: "Не удалось отправить запись. Проверьте связь." };
  }

  return { key: slot.key };
}
