import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { OrderComposer } from "@/components/games/OrderComposer";
import { asProfiles, profilesQuery, requireSession } from "@/lib/data/couple";

export const metadata: Metadata = { title: "Заказ" };

export default async function NewOrderPage() {
  const { supabase, user } = await requireSession();

  const profiles = asProfiles(await profilesQuery(supabase));
  const partner = profiles.find((p) => p.id !== user.id);

  return (
    <div className="px-5 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <Link
        href="/games/draw"
        prefetch
        className="-ml-1 inline-flex min-h-9 items-center gap-0.5 text-[14px] text-text-muted"
      >
        <ChevronLeft size={17} aria-hidden />
        Рисовашки
      </Link>

      <OrderComposer partnerName={partner?.display_name ?? "Второй"} />
    </div>
  );
}
