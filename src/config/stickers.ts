/**
 * Наклейки, разбросанные по фону.
 *
 * Здесь только настройки — сами файлы лежат в public/stickers.
 * Чтобы поставить свои: положите файл рядом с остальными и впишите
 * его имя в src.
 *
 * Что подходит:
 *   • svg и png — обычные картинки;
 *   • gif — анимация играет сама;
 *   • mp4 и webm — тоже играют, приложение само подставит нужный тег.
 *     То, что Telegram называет «GIF», при сохранении обычно оказывается
 *     именно mp4.
 *
 * Что НЕ подходит: .tgs — это упакованный Lottie, браузер его не понимает.
 *
 * Про вес: наклейки крутятся постоянно, поэтому тяжёлые файлы бьют
 * по кадрам и по батарее. Скачанные с Tenor приходят по 500 пикселей
 * при показе в 45 — их стоит уменьшить до 128, вес падает в разы.
 *
 * Правила, по которым подобраны размеры и прозрачность:
 *   • наклейка не должна спорить с содержимым — отсюда небольшой размер
 *     и приглушённость;
 *   • ни одна не попадает в верхнюю зону с заголовком и в нижнюю
 *     с панелью навигации;
 *   • разный наклон и сдвиг начала покачивания — так они выглядят
 *     раскиданными, а не расставленными по сетке.
 */

export type Sticker = {
  src: string;
  /** Положение в процентах от края экрана. */
  top: string;
  left?: string;
  right?: string;
  size: number;
  rotate: number;
  opacity: number;
  /** Сдвиг начала покачивания, чтобы они не качались в такт. */
  delay: number;
  /** Покачивать ли. По умолчанию да у картинок, нет у анимированных. */
  float?: boolean;
  /**
   * Обрезать кружком.
   *
   * Нужно для файлов с непрозрачным фоном — а это почти все gif:
   * формат умеет только «пиксель есть или его нет», мягкой прозрачности
   * в нём не бывает. На тёмном экране такой файл выглядит белым квадратом,
   * а в кружке — как настоящая наклейка.
   */
  shape?: "circle";
};

export const STICKERS: Sticker[] = [
  // Сердечки — самые мелкие и частые, они держат общее настроение
  { src: "/stickers/heart.svg", top: "14%", right: "8%", size: 22, rotate: 14, opacity: 0.5, delay: 0 },
  { src: "/stickers/heart.svg", top: "31%", left: "6%", size: 16, rotate: -18, opacity: 0.4, delay: 2.1 },
  { src: "/stickers/heart.svg", top: "47%", right: "11%", size: 19, rotate: 8, opacity: 0.45, delay: 4.3 },
  { src: "/stickers/heart.svg", top: "63%", left: "9%", size: 14, rotate: -8, opacity: 0.36, delay: 1.2 },
  { src: "/stickers/heart.svg", top: "79%", right: "7%", size: 20, rotate: 16, opacity: 0.42, delay: 3.4 },
  { src: "/stickers/heart.svg", top: "90%", left: "14%", size: 15, rotate: -12, opacity: 0.34, delay: 5.6 },

  { src: "/stickers/star.svg", top: "22%", left: "12%", size: 18, rotate: -6, opacity: 0.4, delay: 1.7 },
  { src: "/stickers/star.svg", top: "57%", right: "13%", size: 14, rotate: 12, opacity: 0.32, delay: 4.9 },
  { src: "/stickers/moon.svg", top: "70%", right: "9%", size: 20, rotate: 10, opacity: 0.38, delay: 3.9 },
  { src: "/stickers/moon.svg", top: "39%", left: "8%", size: 15, rotate: -14, opacity: 0.3, delay: 6.1 },
];

/** Видео нужно вставлять другим тегом, чем картинку. */
export function isVideoSticker(src: string): boolean {
  return /\.(mp4|webm|mov)$/i.test(src);
}
