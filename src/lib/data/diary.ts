import type { DiaryContent, DiaryEntry } from "@/types/database";

export type DiaryItem = DiaryEntry & {
  /** Пусто, если запись ещё закрыта — база просто не отдаёт содержимое. */
  content: DiaryContent | null;
  locked: boolean;
  /**
   * Временная ссылка на голосовую запись.
   *
   * У запертого письма её нет и быть не может: ключ файла лежит в том же
   * содержимом, которого база пока не отдаёт, а без ключа подписать
   * ссылку нечем.
   */
  audioUrl: string | null;
};

/**
 * Склеивает записи с их содержимым.
 *
 * Закрытую чужую запись видно как факт: есть автор и дата открытия,
 * но нет ни заголовка, ни текста. Это решает база, а не код здесь —
 * содержимое просто не приходит.
 */
export function toDiaryItems(
  entryRows: unknown,
  contentRows: unknown,
  /** Ключ файла → подписанная ссылка. Подписывает страница, на сервере. */
  audioUrls: Map<string, string> = new Map(),
): DiaryItem[] {
  const entries = (entryRows as DiaryEntry[] | null) ?? [];
  const contents = (contentRows as DiaryContent[] | null) ?? [];

  return entries.map((entry) => {
    const content = contents.find((c) => c.entry_id === entry.id) ?? null;

    return {
      ...entry,
      content,
      locked: content === null,
      audioUrl: content?.audio_path
        ? (audioUrls.get(content.audio_path) ?? null)
        : null,
    };
  });
}

/** Ключи всех голосовых записей, которые пришли вместе с содержимым. */
export function audioKeys(contentRows: unknown): string[] {
  return ((contentRows as DiaryContent[] | null) ?? [])
    .map((content) => content.audio_path)
    .filter((path): path is string => Boolean(path));
}

/** «через 4 месяца», «завтра» — сколько ждать до открытия. */
export function untilUnlock(unlockAt: string, now: Date = new Date()) {
  const target = new Date(unlockAt);
  const ms = target.getTime() - now.getTime();

  if (ms <= 0) return null;

  const days = Math.ceil(ms / 86_400_000);

  if (days <= 1) {
    const hours = Math.ceil(ms / 3_600_000);
    return hours <= 1 ? "меньше часа" : `${hours} ч`;
  }
  if (days < 31) return `${days} дн`;

  // Годы считаем из месяцев, а не из дней: иначе 364 дня давали
  // «0 г 12 мес» вместо ожидаемого «1 г».
  const months = Math.round(days / 30.4);
  if (months < 12) return `${months} мес`;

  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest > 0 ? `${years} г ${rest} мес` : `${years} г`;
}
