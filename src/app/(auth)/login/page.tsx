import type { Metadata } from "next";

import { LoginForm } from "@/components/auth/LoginForm";
import { appConfig, coupleLabel } from "@/config/app";

export const metadata: Metadata = {
  title: "Вход",
};

export default async function LoginPage(props: PageProps<"/login">) {
  const params = await props.searchParams;
  const raw = params.next;
  const next = typeof raw === "string" && raw.startsWith("/") ? raw : "/";

  return (
    <main className="flex min-h-dvh flex-col justify-center px-6 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-10 text-center">
          {/* Монограмма — тот же знак, что и на иконке приложения.
              По бокам двое тянутся друг к другу через буквы. */}
          <div className="flex items-center justify-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/stickers/star.svg"
              alt=""
              aria-hidden
              width={24}
              height={24}
              className="sticker"
              style={{ ["--tilt" as string]: "-12deg" }}
            />

            <p className="font-display text-[44px] leading-none text-accent">
              {appConfig.name}
            </p>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/stickers/moon.svg"
              alt=""
              aria-hidden
              width={24}
              height={24}
              className="sticker"
              style={{ ["--tilt" as string]: "12deg", animationDelay: "1.2s" }}
            />
          </div>

          <p className="mt-4 text-[15px] tracking-wide text-text">
            {coupleLabel}
          </p>

          <p className="mt-1.5 text-[14px] leading-relaxed text-text-muted">
            Жоним, здесь только мы двое.
          </p>
        </div>

        <LoginForm next={next} />
      </div>
    </main>
  );
}
