import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { WordComposer } from "@/components/games/WordComposer";
import { requireSession } from "@/lib/data/couple";

export const metadata: Metadata = { title: "Загадать слово" };

export default async function NewWordPage() {
  await requireSession();

  return (
    <div className="px-5 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <Link
        href="/games/words"
        prefetch
        className="-ml-1 inline-flex min-h-9 items-center gap-0.5 text-[14px] text-text-muted"
      >
        <ChevronLeft size={17} aria-hidden />
        Угадай слово
      </Link>

      <h1 className="mt-2 font-display text-[26px] leading-tight text-text">
        Загадать слово
      </h1>

      <div className="mt-5">
        <WordComposer />
      </div>
    </div>
  );
}
