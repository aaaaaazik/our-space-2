import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { WhoGame } from "@/components/games/WhoGame";
import { asProfiles, profilesQuery, requireSession } from "@/lib/data/couple";
import type { WhoAnswer, WhoStatement } from "@/types/database";

export const metadata: Metadata = { title: "Кто из нас?" };

export default async function WhoPage() {
  const { supabase, user } = await requireSession();

  const [profilesResult, statementsResult, answersResult] = await Promise.all([
    profilesQuery(supabase),
    supabase
      .from("who_statements")
      .select("*")
      .order("position")
      .order("created_at"),
    // Чужой ответ придёт, только если на это утверждение ответил и сам —
    // это решает база, а не код здесь.
    supabase.from("who_answers").select("*"),
  ]);

  const profiles = asProfiles(profilesResult);
  const partner = profiles.find((p) => p.id !== user.id);

  return (
    <div className="px-5 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <Link
        href="/games"
        prefetch
        className="-ml-1 inline-flex min-h-9 items-center gap-0.5 text-[14px] text-text-muted"
      >
        <ChevronLeft size={17} aria-hidden />
        Игры
      </Link>

      <WhoGame
        statements={(statementsResult.data as WhoStatement[] | null) ?? []}
        answers={(answersResult.data as WhoAnswer[] | null) ?? []}
        currentUserId={user.id}
        myName={
          profiles.find((p) => p.id === user.id)?.display_name ?? "Я"
        }
        partnerId={partner?.id ?? ""}
        partnerName={partner?.display_name ?? "Второй"}
      />
    </div>
  );
}
