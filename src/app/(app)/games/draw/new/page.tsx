import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { DrawingComposer } from "@/components/games/DrawingComposer";
import { requireSession } from "@/lib/data/couple";
import { pickPrompt } from "@/lib/games/drawingPrompts";

export const metadata: Metadata = { title: "Рисуем" };

export default async function NewDrawingPage() {
  await requireSession();

  // Задание выбираем на сервере: если делать это при отрисовке в браузере,
  // серверная и клиентская версии страницы разойдутся.
  const prompt = pickPrompt();

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

      <div className="mt-3">
        <DrawingComposer initialPrompt={prompt} />
      </div>
    </div>
  );
}
