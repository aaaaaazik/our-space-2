import { redirect } from "next/navigation";

import { Ambience } from "@/components/layout/Ambience";
import { BottomNav } from "@/components/layout/BottomNav";
import { Stickers } from "@/components/layout/Stickers";
import { getCurrentUser } from "@/lib/supabase/server";

/**
 * Обёртка приватной части приложения.
 * Проверка сессии здесь дублирует proxy.ts намеренно: если matcher
 * когда-нибудь изменят, страницы всё равно останутся закрытыми.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
      <Ambience />
      <Stickers />
      {/* pb-24 — место под нижнюю навигацию, чтобы контент не уезжал под неё */}
      <main className="flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
