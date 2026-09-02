import type { Metadata } from "next";

import { ChatRoom } from "@/components/chat/ChatRoom";
import { asProfiles, profilesQuery, requireSession } from "@/lib/data/couple";
import { createViewUrls } from "@/lib/storage/r2";
import type { Message } from "@/types/database";

export const metadata: Metadata = { title: "Чат" };

/**
 * Сколько сообщений держим на экране.
 *
 * Переписка на двоих растёт годами, и однажды тянуть её целиком станет
 * дорого. Двести последних — это заметно больше, чем помещается в памяти
 * разговора, а весят они меньше одной фотографии.
 */
const LIMIT = 200;

export default async function ChatPage() {
  const { supabase, user } = await requireSession();

  const [profilesResult, messagesResult] = await Promise.all([
    profilesQuery(supabase),
    supabase
      .from("messages")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(LIMIT),
  ]);

  const profiles = asProfiles(profilesResult);
  const partner = profiles.find((p) => p.id !== user.id);

  // С конца забрали, к началу разворачиваем: читается переписка сверху вниз.
  const rows = ((messagesResult.data as Message[] | null) ?? []).reverse();

  const urls = await createViewUrls(
    rows
      .map((message) => message.audio_path)
      .filter((path): path is string => Boolean(path)),
  );

  const items = rows.map((message) => ({
    ...message,
    audioUrl: message.audio_path
      ? (urls.get(message.audio_path) ?? null)
      : null,
  }));

  return (
    <ChatRoom
      items={items}
      currentUserId={user.id}
      partnerName={partner?.display_name ?? "Второй"}
    />
  );
}
