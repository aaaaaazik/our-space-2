import type { Metadata } from "next";

import { DiaryComposer } from "@/components/diary/DiaryComposer";
import { DiaryList, WaitingHeading } from "@/components/diary/DiaryList";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/Card";
import { asProfiles, profilesQuery, requireSession } from "@/lib/data/couple";
import { audioKeys, toDiaryItems } from "@/lib/data/diary";
import { createViewUrls } from "@/lib/storage/r2";

export const metadata: Metadata = { title: "Дневник" };

export default async function DiaryPage() {
  const { supabase, user } = await requireSession();

  const [profilesResult, entriesResult, contentsResult] = await Promise.all([
    profilesQuery(supabase),
    supabase
      .from("diary_entries")
      .select("*")
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false }),
    // Придёт только то содержимое, которое уже можно читать.
    supabase.from("diary_contents").select("*"),
  ]);

  const profiles = asProfiles(profilesResult);
  const partner = profiles.find((p) => p.id !== user.id);
  const partnerName = partner?.display_name ?? "Второй";

  // Файлы в хранилище лежат приватно. Ссылки выписываем сразу на всю пачку,
  // и только на те записи, содержимое которых база вообще отдала: у запертого
  // письма ключа файла здесь просто нет.
  const items = toDiaryItems(
    entriesResult.data,
    contentsResult.data,
    await createViewUrls(audioKeys(contentsResult.data)),
  );

  // Свои запертые письма отдельно — автор их читает, но важно помнить,
  // что второй пока не может.
  const now = new Date();
  const waiting = items.filter(
    (item) =>
      item.unlock_at &&
      new Date(item.unlock_at) > now &&
      item.author_id === user.id,
  );
  const rest = items.filter((item) => !waiting.includes(item));

  // Имена отдаём обычным объектом. Ни функцию, ни Map через границу
  // сервер-клиент передать нельзя — доедут только простые данные.
  const names = Object.fromEntries(
    profiles.map((p) => [p.id, p.display_name]),
  );

  return (
    <div>
      <PageHeader
        title="Дневник"
        subtitle={items.length > 0 ? "Нажмите, чтобы открыть" : undefined}
        action={<DiaryComposer partnerName={partnerName} />}
      />

      <div className="space-y-6 px-5">
        {items.length === 0 ? (
          <>
            <EmptyState
              emoji="✉️"
              title="Здесь появятся ваши письма"
              description="Первое всегда самое сложное. Напишите хотя бы пару строк о сегодняшнем дне."
            />
            <TimerHint partnerName={partnerName} />
          </>
        ) : (
          <>
            {waiting.length > 0 && (
              <section>
                <WaitingHeading />
                <DiaryList
                  items={waiting}
                  currentUserId={user.id}
                  names={names}
                />
              </section>
            )}

            {rest.length > 0 && (
              <section>
                {waiting.length > 0 && (
                  <h2 className="mb-2.5 text-[12px] tracking-wide text-text-faint uppercase">
                    Открытые
                  </h2>
                )}
                <DiaryList
                  items={rest}
                  currentUserId={user.id}
                  names={names}
                />
              </section>
            )}

            <TimerHint partnerName={partnerName} />
          </>
        )}
      </div>
    </div>
  );
}

/** Мягкая подсказка, что письмо можно отложить. */
function TimerHint({ partnerName }: { partnerName: string }) {
  return (
    <p className="px-1 pb-2 text-center text-[13px] leading-relaxed text-text-faint">
      Жоним, ты тоже можешь поставить таймер — написать сейчас, а открыть{" "}
      {partnerName} через год.
    </p>
  );
}
