import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    /*
      Кэш уже открытых страниц в браузере.

      По умолчанию dynamic = 0: Next.js ничего не запоминает, и переход
      на вкладку, где вы были пять секунд назад, снова идёт на сервер.
      Из Узбекистана до Франкфурта это ~250 мс на каждое переключение.

      30 секунд — компромисс: переключения между разделами мгновенные,
      а свежесть данных не страдает, потому что после сохранения записи
      мы всё равно сбрасываем кэш через revalidatePath и router.refresh().
    */
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },

  async headers() {
    return [
      {
        // Базовые защитные заголовки для всех страниц.
        source: "/:path*",
        headers: [
          // Запрет угадывать тип файла — защита от подмены загруженных изображений.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Запрет встраивать сайт в чужой iframe (защита от кликджекинга).
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          // Приватное пространство не должно попадать в поисковую выдачу.
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
        ],
      },
      {
        // Service worker нельзя кэшировать: иначе обновление приложения
        // не доедет до телефона неделями.
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
