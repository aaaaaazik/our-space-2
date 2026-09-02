import { isVideoSticker, STICKERS, type Sticker } from "@/config/stickers";

/**
 * Наклейки на фоне.
 *
 * Никакой логики — только украшение. Нажатия сквозь них проходят,
 * от чтения с экрана они скрыты.
 *
 * Покачивание сделано анимацией CSS, а не библиотекой: такую браузер
 * отдаёт видеокарте и не тратит на неё основной поток. Шесть наклеек,
 * качающихся через JavaScript, заметно просадили бы кадры на телефоне.
 */
export function Stickers() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {STICKERS.map((sticker, index) => (
        <StickerItem key={index} sticker={sticker} />
      ))}
    </div>
  );
}

function StickerItem({ sticker }: { sticker: Sticker }) {
  // Своё движение у анимированной наклейки уже есть, поэтому качать её
  // сверху не нужно — вместе выглядит суетливо.
  const animated = isVideoSticker(sticker.src) || sticker.src.endsWith(".gif");
  const float = sticker.float ?? !animated;

  const style = {
    top: sticker.top,
    left: sticker.left,
    right: sticker.right,
    width: sticker.size,
    opacity: sticker.opacity,
    // Наклон задаём переменной: анимация покачивания добавляет
    // к нему своё смещение, не перетирая исходный поворот.
    ["--tilt" as string]: `${sticker.rotate}deg`,
    animationDelay: `${sticker.delay}s`,
    transform: float ? undefined : `rotate(${sticker.rotate}deg)`,
  };

  const shape =
    sticker.shape === "circle"
      ? "aspect-square rounded-full object-cover ring-1 ring-white/25"
      : "";

  const className = `absolute ${float ? "sticker" : ""} ${shape}`;

  if (isVideoSticker(sticker.src)) {
    return (
      <video
        src={sticker.src}
        // Три атрибута обязательны, иначе iOS откажется играть само:
        // без звука, без выхода на весь экран, и по кругу.
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        className={className}
        style={style}
      />
    );
  }

  return (
    // Оптимизатор next/image здесь не нужен: это готовые небольшие файлы,
    // а для gif он и вовсе сломал бы анимацию.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={sticker.src}
      alt=""
      width={sticker.size}
      height={sticker.size}
      // Без ленивой загрузки: наклейки закреплены на экране и всегда
      // в кадре, откладывать их незачем — а браузер при lazy может
      // так и не собраться их загрузить.
      className={className}
      style={style}
    />
  );
}
