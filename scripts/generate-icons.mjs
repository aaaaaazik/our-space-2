/**
 * Генерация иконок приложения из одного SVG.
 * Запуск: npm run icons
 *
 * Зачем скрипт, а не готовые картинки: поменяли цвет или монограмму в одном
 * месте — пересобрали все размеры сразу, без графического редактора.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "icons");

const MARK = "#fffaf3";

/**
 * Монограмма S & A — первые буквы двух имён.
 * Амперсанд намеренно меньше и курсивом: он связывает буквы,
 * но не спорит с ними по весу.
 *
 * Фон переливается от розы к карамели — теми же цветами, что и акценты
 * в приложении, чтобы иконка не выбивалась. Сердечко под буквами мелкое
 * намеренно: на иконке домашнего экрана крупное превратилось бы в пятно
 * и отняло бы место у монограммы.
 */
const icon = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#a45f58"/>
      <stop offset="55%" stop-color="#c07a67"/>
      <stop offset="100%" stop-color="#dfae7c"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.18" r="0.75">
      <stop offset="0%" stop-color="#fff4e6" stop-opacity="0.32"/>
      <stop offset="100%" stop-color="#fff4e6" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="512" height="512" fill="url(#bg)"/>
  <rect width="512" height="512" fill="url(#glow)"/>

  <g fill="${MARK}" font-family="Georgia, 'Times New Roman', serif">
    <text x="152" y="306" font-size="180" text-anchor="middle">S</text>
    <text x="256" y="288" font-size="96" font-style="italic" text-anchor="middle" opacity="0.72">&amp;</text>
    <text x="360" y="306" font-size="180" text-anchor="middle">A</text>
  </g>

  <path d="M256 398c-27-19.5-42-33.5-42-51.5 0-14.1 10.8-24 23.4-24 7.8 0 14.4 3.9 18.6 9.9 4.2-6 10.8-9.9 18.6-9.9 12.6 0 23.4 9.9 23.4 24 0 18-15 32-42 51.5z"
        fill="${MARK}" opacity="0.85"/>
</svg>`;

const targets = [
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
  // iOS игнорирует manifest и берёт именно apple-touch-icon.
  // Прозрачность не поддерживается, поэтому фон обязателен.
  { file: "apple-touch-icon.png", size: 180 },
];

await mkdir(outDir, { recursive: true });

for (const { file, size } of targets) {
  const png = await sharp(Buffer.from(icon)).resize(size, size).png().toBuffer();
  await writeFile(join(outDir, file), png);
  console.log(`✓ ${file} (${size}×${size})`);
}

// Иконка вкладки браузера — Next.js подхватывает src/app/icon.png автоматически.
const favicon = await sharp(Buffer.from(icon)).resize(64, 64).png().toBuffer();
await writeFile(join(root, "src", "app", "icon.png"), favicon);
console.log("✓ src/app/icon.png (64×64)");
