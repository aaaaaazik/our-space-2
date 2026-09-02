import type { MetadataRoute } from "next";

import { appConfig } from "@/config/app";

/**
 * Манифест PWA — по нему телефон понимает, что сайт можно установить
 * как приложение, и каким оно должно быть после установки.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: appConfig.name,
    short_name: appConfig.shortName,
    description: appConfig.description,
    start_url: "/",
    scope: "/",
    // standalone убирает адресную строку — запуск с иконки выглядит как приложение.
    display: "standalone",
    orientation: "portrait",
    background_color: appConfig.themeColor.light,
    theme_color: appConfig.themeColor.light,
    lang: "ru",
    dir: "ltr",
    categories: ["lifestyle"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        // maskable — Android обрезает иконку под форму системы.
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
