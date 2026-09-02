import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { HeartsRoom } from "@/components/games/HeartsRoom";
import { asProfiles, profilesQuery, requireSession } from "@/lib/data/couple";
import type { HeartsCell, HeartsGame, HeartsShot } from "@/types/database";

export const metadata: Metadata = { title: "Сердечный бой" };

export default async function HeartsPage() {
  const { supabase, user } = await requireSession();

  const [profilesResult, gameResult] = await Promise.all([
    profilesQuery(supabase),
    // Идущая партия. Одновременно она может быть только одна — за этим
    // следит сама база, когда партию создают.
    supabase
      .from("hearts_games")
      .select("*")
      .is("winner", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const profiles = asProfiles(profilesResult);
  const partner = profiles.find((p) => p.id !== user.id);
  let game = gameResult.data as HeartsGame | null;

  // Законченную партию показываем один раз — сразу после победы, чтобы
  // было видно, чем всё кончилось.
  if (!game) {
    const { data } = await supabase
      .from("hearts_games")
      .select("*")
      .not("winner", "is", null)
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    game = data as HeartsGame | null;
  }

  let cells: number[] = [];
  let shots: HeartsShot[] = [];

  if (game) {
    // Расстановка приходит только своя: чужую база не отдаёт никому.
    const [cellsResult, shotsResult] = await Promise.all([
      supabase.from("hearts_cells").select("*").eq("game_id", game.id),
      supabase.from("hearts_shots").select("*").eq("game_id", game.id),
    ]);

    cells = ((cellsResult.data as HeartsCell[] | null) ?? []).map((c) => c.idx);
    shots = (shotsResult.data as HeartsShot[] | null) ?? [];
  }

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

      <HeartsRoom
        game={game}
        myCells={cells}
        shots={shots}
        currentUserId={user.id}
        partnerName={partner?.display_name ?? "Второй"}
      />
    </div>
  );
}
