// Печём первый экран /reviews из исходника photo_video/отзывы_hero/hero_png_V2.png.
//
// Что делает скрипт:
//   1) срезает прозрачные поля вокруг композиции (в исходнике их 407 px слева);
//   2) вытравливает три КРАСНЫЕ РАМКИ-ПЛЕЙСХОЛДЕРЫ, нарисованные дизайнером
//      под плашки с отзывами, — поверх них в разметке встают настоящие плашки,
//      но до xl плашек нет, и без вытравливания рамки светились бы на телефоне;
//   3) сохраняет public/media/photo/reviews/hero.webp.
//
// Замазка — диффузия по соседям: рамки тонкие (~2 px) и лежат на ровном небе,
// поэтому пиксель за пикселем подтягиваем цвет с краёв внутрь, потом слегка
// разглаживаем. Ищем красное ТОЛЬКО внутри трёх известных прямоугольников:
// на фотографиях есть красные спасжилеты, и глобальный поиск съел бы их.
//
// Запуск: node scripts/bake-reviews-hero.mjs
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(root, "photo_video/отзывы_hero/hero_png_V2.png");
const OUT = path.join(root, "public/media/photo/reviews/hero.webp");

// Внешние границы красных рамок в координатах ИСХОДНОГО файла 1672×940.
// Все три ровно 293×94 px — по ним же расставлены плашки в page.tsx.
const FRAMES = [
  { x0: 1010, y0: 86, x1: 1302, y1: 179 },
  { x0: 1345, y0: 197, x1: 1637, y1: 290 },
  { x0: 1166, y0: 385, x1: 1458, y1: 478 },
];
const PAD = 6; // запас вокруг рамки, чтобы поймать полупрозрачную кромку

const img = sharp(SRC);
const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: C } = info;
const at = (x, y) => (y * W + x) * C;

// ── 1. Маска: красные пиксели внутри рамок ────────────────────────────────
const mask = new Uint8Array(W * H);
let marked = 0;
for (const f of FRAMES) {
  for (let y = f.y0 - PAD; y <= f.y1 + PAD; y++) {
    for (let x = f.x0 - PAD; x <= f.x1 + PAD; x++) {
      const o = at(x, y);
      if (data[o] - data[o + 1] > 12 && data[o] - data[o + 2] > 12) {
        mask[y * W + x] = 1;
        marked++;
      }
    }
  }
}

// Расширяем маску на 1 px: у кромки штриха краснота уже почти не читается,
// но пиксель всё равно подкрашен и после замазки давал бы розовый ореол.
const grown = Uint8Array.from(mask);
for (let y = 1; y < H - 1; y++) {
  for (let x = 1; x < W - 1; x++) {
    if (!mask[y * W + x]) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) grown[(y + dy) * W + x + dx] = 1;
  }
}
mask.set(grown);
let holes = 0;
for (let i = 0; i < mask.length; i++) if (mask[i]) holes++;
console.log(`красных пикселей: ${marked}, к замазке с кромкой: ${holes}`);

// ── 2. Диффузия: слой за слоем заливаем дырку цветом с её краёв ───────────
const todo = new Uint8Array(mask);
const fixed = []; // что замазали — по ним потом пройдёмся сглаживанием
for (let pass = 0; pass < 40; pass++) {
  const ready = [];
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (!todo[y * W + x]) continue;
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (todo[(y + dy) * W + x + dx]) continue;
          const o = at(x + dx, y + dy);
          r += data[o]; g += data[o + 1]; b += data[o + 2]; a += data[o + 3]; n++;
        }
      }
      if (n) ready.push([x, y, r / n, g / n, b / n, a / n]);
    }
  }
  if (!ready.length) break;
  for (const [x, y, r, g, b, a] of ready) {
    const o = at(x, y);
    data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = a;
    todo[y * W + x] = 0;
    fixed.push([x, y]);
  }
}

// ── 3. Сглаживание замазанных пикселей ────────────────────────────────────
// Диффузия оставляет еле заметный «шов» посреди бывшего штриха: небо здесь с
// градиентом, а слои сходятся встык. Три прохода усреднения по 3×3 его гасят.
for (let pass = 0; pass < 3; pass++) {
  const upd = fixed.map(([x, y]) => {
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const o = at(x + dx, y + dy);
        r += data[o]; g += data[o + 1]; b += data[o + 2]; a += data[o + 3]; n++;
      }
    }
    return [x, y, r / n, g / n, b / n, a / n];
  });
  for (const [x, y, r, g, b, a] of upd) {
    const o = at(x, y);
    data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = a;
  }
}

// ── 4. Обрезка прозрачных полей и запись ──────────────────────────────────
// Обрезка и кодирование — одной цепочкой: если сначала сложить webp в буфер, а
// потом отдать его новому sharp'у на запись, файл кодируется ВТОРОЙ раз уже с
// качеством по умолчанию, и quality: 90 пропадает впустую.
const written = await sharp(data, { raw: { width: W, height: H, channels: C } })
  .trim({ threshold: 0 })
  .webp({ quality: 90 })
  .toFile(OUT);

console.log(`готово: ${OUT} — ${written.width}×${written.height}, ${(written.size / 1024) | 0} КБ`);
