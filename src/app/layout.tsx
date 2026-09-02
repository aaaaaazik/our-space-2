import type { Metadata, Viewport } from "next";
import { Caveat, Inter, Lora } from "next/font/google";

import { ServiceWorkerRegistrar } from "@/components/pwa/ServiceWorkerRegistrar";
import { appConfig } from "@/config/app";

import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

// Лора — тёплая книжная антиква с поддержкой кириллицы.
// Используется только для заголовков, чтобы приложение ощущалось дневником.
const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

// Рукописный — только для текста писем в дневнике.
// Caveat выбран потому, что почти все красивые рукописные шрифты
// не умеют кириллицу: русский текст в них превращается в квадраты.
const caveat = Caveat({
  variable: "--font-caveat",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: appConfig.name,
    template: `%s · ${appConfig.name}`,
  },
  description: appConfig.description,
  applicationName: appConfig.name,
  manifest: "/manifest.webmanifest",
  // Приватное пространство не должно попадать в поисковики.
  robots: { index: false, follow: false, nocache: true },
  appleWebApp: {
    capable: true,
    title: appConfig.shortName,
    // black-translucent растягивает контент под вырез и Dynamic Island —
    // именно это делает PWA похожей на нативное приложение.
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
    date: false,
    address: false,
    email: false,
  },
  other: {
    // Next.js выводит современное «mobile-web-app-capable», но Safari
    // исторически читает вариант с префиксом apple. На iOS 16.4+ хватает
    // манифеста, на более ранних — нужен именно этот тег.
    "apple-mobile-web-app-capable": "yes",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Запрет масштабирования — иначе двойной тап «прыгает» как на сайте.
  maximumScale: 1,
  userScalable: false,
  // cover обязателен, чтобы работали env(safe-area-inset-*).
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: appConfig.themeColor.light },
    { media: "(prefers-color-scheme: dark)", color: appConfig.themeColor.dark },
  ],
};

/**
 * Выполняется до отрисовки страницы и ставит выбранную тему на <html>.
 * Без этого при загрузке был бы заметен «мигающий» светлый экран.
 */
const themeScript = `
(function () {
  try {
    var stored = localStorage.getItem('our-space-theme');
    if (stored === 'light' || stored === 'dark') {
      document.documentElement.setAttribute('data-theme', stored);
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ru"
      className={`${inter.variable} ${lora.variable} ${caveat.variable} h-full`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full">
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
