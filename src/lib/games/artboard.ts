/**
 * Общая часть рисовалки: из чего состоит рисунок и как он рисуется.
 *
 * Отдельным файлом, потому что нужен в трёх местах сразу — в превью,
 * в полноэкранном редакторе и при выгрузке готовой картинки.
 */

/**
 * Размер листа в собственных единицах.
 *
 * Всё, что нарисовано, хранится не в пикселях экрана, а в этой сетке — и
 * в ней же перерисовывается при любом увеличении. Поэтому приближение
 * даёт действительно более чёткую линию, а не увеличенные пиксели: рисунок
 * пересчитывается заново, как чертёж, а не растягивается как фотография.
 */
const LONG = 1600;
const SHORT = 1000;

export type Orientation = "portrait" | "landscape";

/** Вид бумаги. Он часть рисунка, а не подсказка: его видно и на готовой картинке. */
export type PaperKind =
  | "white"
  | "cream"
  | "kraft"
  | "night"
  | "grid"
  | "lined"
  | "dots";

export type Paper = { kind: PaperKind; orientation: Orientation };

export const PAPERS: Array<{ kind: PaperKind; title: string; swatch: string }> = [
  { kind: "white", title: "Белый", swatch: "#ffffff" },
  { kind: "cream", title: "Кремовый", swatch: "#fdf6e8" },
  { kind: "kraft", title: "Крафт", swatch: "#d9bc94" },
  { kind: "night", title: "Ночной", swatch: "#1d1b2a" },
  { kind: "grid", title: "Клетка", swatch: "#f4f6fa" },
  { kind: "lined", title: "Линейка", swatch: "#fbfbfd" },
  { kind: "dots", title: "Точки", swatch: "#fafaf7" },
];

/** Цвет бумаги и цвет её разлиновки. */
const PAPER_LOOK: Record<PaperKind, { fill: string; rule: string | null }> = {
  white: { fill: "#ffffff", rule: null },
  cream: { fill: "#fdf6e8", rule: null },
  kraft: { fill: "#d9bc94", rule: null },
  night: { fill: "#1d1b2a", rule: null },
  grid: { fill: "#ffffff", rule: "rgba(17, 24, 39, 0.08)" },
  lined: { fill: "#ffffff", rule: "rgba(17, 24, 39, 0.10)" },
  dots: { fill: "#fffdf8", rule: "rgba(17, 24, 39, 0.16)" },
};

/** Размеры листа при выбранной ориентации. */
export function paperSize(paper: Paper) {
  return paper.orientation === "portrait"
    ? { w: SHORT, h: LONG }
    : { w: LONG, h: SHORT };
}

/** На тёмной бумаге по умолчанию рисуют светлым — иначе не видно. */
export function defaultInk(paper: Paper): string {
  return paper.kind === "night" ? "#ffffff" : "#111827";
}

export type Tool = "pen" | "pencil" | "marker" | "highlighter" | "eraser";

export type Stroke = {
  kind: "stroke";
  tool: Tool;
  color: string;
  /** Толщина в единицах листа, а не в пикселях экрана. */
  width: number;
  points: Array<{ x: number; y: number }>;
};

/** Штамп: цветок, искра, сердечко. Ставится одним касанием. */
export type Stamp = {
  kind: "stamp";
  glyph: string;
  size: number;
  /** Небольшой поворот, чтобы одинаковые штампы не выглядели штамповкой. */
  angle: number;
  x: number;
  y: number;
};

export type Caption = {
  kind: "text";
  text: string;
  color: string;
  size: number;
  x: number;
  y: number;
};

export type Item = Stroke | Stamp | Caption;

/** Шрифт надписи. Один и тот же и при отрисовке, и при измерении. */
function captionFont(size: number): string {
  return `600 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
}

/**
 * Холст только для замеров.
 *
 * Ширину надписи иначе не узнать: она зависит от шрифта, а не от числа
 * букв. Один холст на всё приложение — создавать его на каждый замер
 * было бы расточительно.
 */
let measurer: CanvasRenderingContext2D | null = null;

/**
 * Рамка надписи в единицах листа.
 *
 * Надпись рисуется от центра, поэтому и рамка считается от него же:
 * так её можно и подсветить, и поймать касанием.
 */
export function captionBox(item: Caption): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  if (!measurer && typeof document !== "undefined") {
    measurer = document.createElement("canvas").getContext("2d");
  }

  let w = item.size * item.text.length * 0.6;

  if (measurer) {
    measurer.font = captionFont(item.size);
    w = measurer.measureText(item.text).width;
  }

  const h = item.size * 1.25;

  return { x: item.x - w / 2, y: item.y - h / 2, w, h };
}

/** Готовые цвета. Свой оттенок выбирается отдельно, системной палитрой. */
export const COLORS = [
  "#111827", "#4b5563", "#9ca3af", "#ffffff",
  "#7f1d1d", "#dc2626", "#f87171", "#fecaca",
  "#7c2d12", "#ea580c", "#fb923c", "#fed7aa",
  "#713f12", "#ca8a04", "#facc15", "#fef08a",
  "#14532d", "#16a34a", "#4ade80", "#bbf7d0",
  "#134e4a", "#0d9488", "#2dd4bf", "#99f6e4",
  "#1e3a8a", "#2563eb", "#60a5fa", "#bfdbfe",
  "#4c1d95", "#7c3aed", "#a78bfa", "#ddd6fe",
  "#831843", "#db2777", "#f472b6", "#fbcfe8",
  "#451a03", "#92400e", "#d6b48a", "#f5e6d3",
] as const;

/** Штампы для кисти-«брызгалки». */
export const GLYPHS = [
  "🌸", "🌷", "🌼", "🌹",
  "🌿", "🍃", "🍂", "🌱",
  "✨", "💫", "⭐", "🔥",
  "💖", "❤️", "💌", "🎀",
  "🦋", "🐞", "☁️", "🌙",
] as const;

/** Толщины, тоже в единицах листа. */
export const SIZES = [3, 8, 16, 32, 64] as const;

/**
 * Как ведёт себя каждая кисть.
 *
 * Разница не в цвете, а в том, как ложится след: маркер плоский и плотный,
 * хайлайтер прозрачный и перемножается с тем, что под ним, — поэтому
 * пересечения у него темнеют сами, как у настоящего.
 */
const BRUSH: Record<
  Tool,
  { alpha: number; scale: number; cap: CanvasLineCap; multiply: boolean }
> = {
  pen: { alpha: 1, scale: 1, cap: "round", multiply: false },
  pencil: { alpha: 0.75, scale: 0.7, cap: "round", multiply: false },
  marker: { alpha: 0.95, scale: 1.6, cap: "square", multiply: false },
  highlighter: { alpha: 0.32, scale: 2.6, cap: "square", multiply: true },
  eraser: { alpha: 1, scale: 1.2, cap: "round", multiply: false },
};

/** Шаг разлиновки. */
const RULE_STEP = 80;

/** Бумага целиком: цвет и разлиновка. */
export function paintPaper(ctx: CanvasRenderingContext2D, paper: Paper): void {
  const { w, h } = paperSize(paper);
  const look = PAPER_LOOK[paper.kind];

  ctx.save();
  ctx.fillStyle = look.fill;
  ctx.fillRect(0, 0, w, h);

  if (look.rule) {
    ctx.strokeStyle = look.rule;
    ctx.fillStyle = look.rule;
    ctx.lineWidth = 1.5;

    if (paper.kind === "dots") {
      for (let x = RULE_STEP; x < w; x += RULE_STEP) {
        for (let y = RULE_STEP; y < h; y += RULE_STEP) {
          ctx.beginPath();
          ctx.arc(x, y, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else {
      ctx.beginPath();
      // У линейки только горизонтальные линии, у клетки — обе стороны.
      if (paper.kind === "grid") {
        for (let x = RULE_STEP; x < w; x += RULE_STEP) {
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
        }
      }
      for (let y = RULE_STEP; y < h; y += RULE_STEP) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();
    }
  }

  ctx.restore();
}

function paintStroke(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  const brush = BRUSH[stroke.tool];
  const pts = stroke.points;
  if (pts.length === 0) return;

  ctx.save();
  ctx.globalAlpha = brush.alpha;
  if (brush.multiply) ctx.globalCompositeOperation = "multiply";

  ctx.lineCap = brush.cap;
  ctx.lineJoin = "round";
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineWidth = stroke.width * brush.scale;

  // Точка без движения тоже должна оставить след — иначе одиночное
  // касание не рисует ничего.
  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, (stroke.width * brush.scale) / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  /*
    Квадратичные кривые по серединам отрезков, а не ломаная.

    Палец даёт рваный след, и ломаная из него выглядит дрожащей. Кривая
    через середины сглаживает её, не смещая саму линию.
  */
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);

  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }

  const last = pts[pts.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
  ctx.restore();
}

export function paintItems(
  ctx: CanvasRenderingContext2D,
  items: Item[],
  paper: Paper,
): void {
  const erase = PAPER_LOOK[paper.kind].fill;

  for (const item of items) {
    if (item.kind === "stroke") {
      // Ластик — это та же кисть цветом бумаги: так он честно работает
      // и с отменой, и с любым фоном.
      paintStroke(
        ctx,
        item.tool === "eraser" ? { ...item, color: erase } : item,
      );
      continue;
    }

    if (item.kind === "stamp") {
      ctx.save();
      ctx.translate(item.x, item.y);
      ctx.rotate(item.angle);
      ctx.font = `${item.size}px serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(item.glyph, 0, 0);
      ctx.restore();
      continue;
    }

    ctx.save();
    ctx.fillStyle = item.color;
    ctx.font = captionFont(item.size);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(item.text, item.x, item.y);
    ctx.restore();
  }
}

/**
 * Готовая картинка для отправки.
 *
 * Размер зависит только от ориентации листа, но не от экрана, с которого
 * рисовали: иначе рисунок с телефона и рисунок с компьютера приходили бы
 * разного качества.
 */
export function toBlob(items: Item[], paper: Paper): Promise<Blob | null> {
  if (items.length === 0) return Promise.resolve(null);

  const { w, h } = paperSize(paper);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);

  paintPaper(ctx, paper);
  paintItems(ctx, items, paper);

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}
