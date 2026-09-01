// Печём первый экран /reviews из исходника photo_video/отзывы_hero/hero_rewies.png.
//
// Что делает скрипт:
//   1) НАХОДИТ красные рамки-плейсхолдеры, нарисованные дизайнером под плашки
//      с отзывами, и печатает их координаты и центры в процентах кадра — эти
//      числа руками переносятся в HERO_CHIPS в src/app/[locale]/reviews/page.tsx;
//   2) вытравливает эти рамки из картинки: поверх них в разметке встают
//      настоящие плашки, но до xl плашек нет, и рамки светились бы на телефоне;
//   3) срезает прозрачные поля вокруг композиции (в исходнике их 407 px слева);
//   4) сохраняет public/media/photo/reviews/hero.webp.
//
// Замазка — диффузия по соседям: рамки тонкие (~2 px) и лежат на ровном фоне,
// поэтому пиксель за пикселем подтягиваем цвет с краёв внутрь, потом слегка
// разглаживаем.
//
// Пришлют новый макет — поменяйте SRC и прогоните скрипт: рамки он найдёт сам
// и напечатает готовые cx/cy.
//
// Запуск: node scripts/bake-reviews-hero.mjs
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(root, "photo_video/отзывы_hero/hero_rewies.png");
const OUT = path.join(root, "public/media/photo/reviews/hero.webp");

const PAD = 6; // окно поиска вокруг найденной рамки
const DILATE = 2; // на сколько расширить штрих, чтобы забрать сглаженную кромку

const img = sharp(SRC);
const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: C } = info;
const at = (x, y) => (y * W + x) * C;

// ── 1. Поиск красных рамок ────────────────────────────────────────────────
// Собираем ярко-красные пиксели в связные пятна и оставляем только крупные:
// на фотографии есть красный спасжилет (117×164 px), и без отсева по ширине
// он попал бы в список наравне с рамками.
const MIN_FRAME_W = 150;
const MIN_FRAME_H = 50;

const isRed = (o) =>
  data[o + 3] > 100 && data[o] > 120 && data[o] - data[o + 1] > 60 && data[o] - data[o + 2] > 60;

const red = new Uint8Array(W * H);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) if (isRed(at(x, y))) red[y * W + x] = 1;
}

// Обход в ширину с окном 5×5: штрих рамки местами прерывается на светлом фоне,
// и по соседям вплотную она разваливалась бы на десяток кусков.
const seen = new Uint8Array(W * H);
const FRAMES = [];
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const start = y * W + x;
    if (!red[start] || seen[start]) continue;
    seen[start] = 1;
    const stack = [start];
    let x0 = x, y0 = y, x1 = x, y1 = y;
    while (stack.length) {
      const c = stack.pop();
      const cx = c % W, cy = (c / W) | 0;
      if (cx < x0) x0 = cx;
      if (cx > x1) x1 = cx;
      if (cy < y0) y0 = cy;
      if (cy > y1) y1 = cy;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const nk = ny * W + nx;
          if (red[nk] && !seen[nk]) { seen[nk] = 1; stack.push(nk); }
        }
      }
    }
    if (x1 - x0 + 1 >= MIN_FRAME_W && y1 - y0 + 1 >= MIN_FRAME_H) FRAMES.push({ x0, y0, x1, y1 });
  }
}
FRAMES.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
if (!FRAMES.length) throw new Error("красных рамок в исходнике не найдено — проверьте SRC");

// ── 2. Маска: сам штрих рамки плюс его кромка ─────────────────────────────
// Берём только ярко-красные пиксели найденных рамок и расширяем пятно на PAD
// во все стороны: штрих сглажен, и по краям остаётся подкрашенная кайма,
// которая после замазки светилась бы розовым ореолом.
//
// Расширение, а не мягкий порог по всему прямоугольнику рамки: две нижние
// рамки лежат на ПЕСКЕ, а песок сам по себе тёплый (красного в нём больше,
// чем синего), и мягкий порог отправлял под замазку весь песок внутри рамки.
const mask = new Uint8Array(W * H);
let marked = 0;
for (const f of FRAMES) {
  for (let y = f.y0 - PAD; y <= f.y1 + PAD; y++) {
    for (let x = f.x0 - PAD; x <= f.x1 + PAD; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      if (!red[y * W + x]) continue;
      mask[y * W + x] = 1;
      marked++;
    }
  }
}

const grown = Uint8Array.from(mask);
for (let y = DILATE; y < H - DILATE; y++) {
  for (let x = DILATE; x < W - DILATE; x++) {
    if (!mask[y * W + x]) continue;
    for (let dy = -DILATE; dy <= DILATE; dy++) {
      for (let dx = -DILATE; dx <= DILATE; dx++) grown[(y + dy) * W + x + dx] = 1;
    }
  }
}
mask.set(grown);
let holes = 0;
for (let i = 0; i < mask.length; i++) if (mask[i]) holes++;
console.log(`красных пикселей: ${marked}, к замазке с кромкой: ${holes}`);

// ── 3. Диффузия: слой за слоем заливаем дырку цветом с её краёв ───────────
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

// ── 4. Сглаживание замазанных пикселей ────────────────────────────────────
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

// ── 5. Обрезка прозрачных полей и запись ──────────────────────────────────
// Обрезка и кодирование — одной цепочкой: если сначала сложить webp в буфер, а
// потом отдать его новому sharp'у на запись, файл кодируется ВТОРОЙ раз уже с
// качеством по умолчанию, и quality: 90 пропадает впустую.
const written = await sharp(data, { raw: { width: W, height: H, channels: C } })
  .trim({ threshold: 0 })
  .webp({ quality: 90 })
  .toFile(OUT);

console.log(`готово: ${OUT} — ${written.width}×${written.height}, ${(written.size / 1024) | 0} КБ`);

// ── 6. Координаты плашек для page.tsx ─────────────────────────────────────
// Печатаем центры рамок в процентах от ОБРЕЗАННОГО кадра — ровно в том виде,
// в каком они лежат в HERO_CHIPS. Обрезка сдвигает начало координат, поэтому
// вычитаем её отступы (sharp отдаёт их отрицательными).
const offX = -(written.trimOffsetLeft ?? 0);
const offY = -(written.trimOffsetTop ?? 0);
console.log(`рамок найдено: ${FRAMES.length}. Центры для HERO_CHIPS:`);
for (const f of FRAMES) {
  const cx = ((f.x0 + f.x1 + 1) / 2 - offX) / written.width;
  const cy = ((f.y0 + f.y1 + 1) / 2 - offY) / written.height;
  const w = f.x1 - f.x0 + 1;
  const h = f.y1 - f.y0 + 1;
  console.log(
    `  ${w}×${h} в ${f.x0},${f.y0}  →  cx: ${(cx * 100).toFixed(2)}, cy: ${(cy * 100).toFixed(2)}`,
  );
}
