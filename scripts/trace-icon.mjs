// Переводит PNG-силуэт иконки в путь SVG для src/components/icons.tsx.
//
// Зачем: David рисует иконки картинками (photo_video/иконки/*.png), а на сайте
// иконки — инлайновые SVG с fill="currentColor". Только так они белеют на
// активной вкладке нижней панели и красятся под блок, в котором стоят. Картинку
// покрасить нельзя, поэтому силуэт обводится и превращается в путь.
//
// Запуск:
//   node scripts/trace-icon.mjs photo_video/иконки/icon_foil.png
//   node scripts/trace-icon.mjs photo_video/иконки/*.png     (несколько сразу)
//
// Печатает готовое содержимое <path d="…" /> — остаётся вставить в icons.tsx.
//
// Внешних трассировщиков (potrace, imagemagick) в окружении нет, поэтому обводка
// своя: граница идёт «по щелям» между точками, дальше ломаная упрощается
// алгоритмом Рамера—Дугласа—Пекера. Дырки внутри фигуры получаются сами —
// у них обратное направление обхода, и правило заливки nonzero делает из них
// отверстия.
import sharp from "sharp";

const SIZE = 256; // разрешение обводки: мельче — грубо, крупнее — длинный путь
const EPS = 0.9; // насколько упрощать ломаную, в точках обводки
const BOX = 24; // коробка иконки, как у остальных в icons.tsx

// Чёрно-белая маска: что фигура, а что фон.
async function readMask(src) {
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;

  // Часть иконок пришла с прозрачным фоном, часть — с залитым чёрным. Смотрим
  // на долю прозрачных точек и решаем, по чему отделять фигуру.
  let transparent = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 128) transparent++;
  const byAlpha = transparent / (w * h) > 0.02;

  const m = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const [r, g, b, a] = data.subarray(i * 4, i * 4 + 4);
    m[i] = byAlpha ? (a > 128 ? 1 : 0) : (r + g + b > 90 ? 1 : 0);
  }
  return { m, w, h, byAlpha };
}

// Рамка вокруг фигуры: поля в файле у всех разные, а иконка должна занимать
// свою коробку целиком.
function bounds(m, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (m[y * w + x]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  return { x0, y0, x1, y1 };
}

// Уменьшаем маску до SIZE по длинной стороне — обводить оригинал в 1254 точки
// незачем, путь вышел бы в десятки килобайт.
function shrink(m, w, h, box) {
  const bw = box.x1 - box.x0 + 1;
  const bh = box.y1 - box.y0 + 1;
  const k = Math.max(bw, bh) / SIZE;
  const W = Math.max(1, Math.round(bw / k));
  const H = Math.max(1, Math.round(bh / k));
  const out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const sx0 = box.x0 + Math.floor(x * k);
      const sy0 = box.y0 + Math.floor(y * k);
      const sx1 = Math.min(box.x0 + Math.max(Math.floor((x + 1) * k), Math.floor(x * k) + 1), w);
      const sy1 = Math.min(box.y0 + Math.max(Math.floor((y + 1) * k), Math.floor(y * k) + 1), h);
      let on = 0, all = 0;
      for (let sy = sy0; sy < sy1; sy++)
        for (let sx = sx0; sx < sx1; sx++) {
          all++;
          on += m[sy * w + sx];
        }
      out[y * W + x] = all && on / all >= 0.5 ? 1 : 0;
    }
  return { m: out, w: W, h: H };
}

// Замкнутые петли границы. Для каждой стороны точки, за которой фон, кладём
// направленное ребро, потом сшиваем рёбра в петли.
function contours(m, w, h) {
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && m[y * w + x] === 1;
  const edges = new Map();
  const push = (a, b) => {
    const k = `${a[0]},${a[1]}`;
    if (!edges.has(k)) edges.set(k, []);
    edges.get(k).push(b);
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!on(x, y)) continue;
      if (!on(x, y - 1)) push([x, y], [x + 1, y]);
      if (!on(x + 1, y)) push([x + 1, y], [x + 1, y + 1]);
      if (!on(x, y + 1)) push([x + 1, y + 1], [x, y + 1]);
      if (!on(x - 1, y)) push([x, y + 1], [x, y]);
    }

  const loops = [];
  for (const [key, list] of edges) {
    while (list.length) {
      const start = key.split(",").map(Number);
      let cur = start;
      let next = list.shift();
      const loop = [start];
      let guard = 0;
      while (next && (next[0] !== start[0] || next[1] !== start[1]) && guard++ < 1e6) {
        loop.push(next);
        const outs = edges.get(`${next[0]},${next[1]}`);
        if (!outs || !outs.length) break;
        // На перекрёстке (фигура касается сама себя углом) поворачиваем правее —
        // иначе две части слипаются в одну петлю с перемычкой.
        const dx = next[0] - cur[0];
        const dy = next[1] - cur[1];
        let best = 0;
        let bestScore = -Infinity;
        outs.forEach((o, i) => {
          const ox = o[0] - next[0];
          const oy = o[1] - next[1];
          const cross = dx * oy - dy * ox; // > 0 — поворот направо (ось y вниз)
          const straight = dx * ox + dy * oy > 0;
          const score = cross > 0 ? 2 : cross === 0 && straight ? 1 : 0;
          if (score > bestScore) {
            bestScore = score;
            best = i;
          }
        });
        cur = next;
        next = outs.splice(best, 1)[0];
      }
      if (loop.length > 3) loops.push(loop);
    }
  }
  return loops;
}

function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    let far = -1;
    let dmax = 0;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      const d = Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len;
      if (d > dmax) {
        dmax = d;
        far = i;
      }
    }
    if (dmax > eps && far > 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

// ⚠️ Упрощать ЗАМКНУТУЮ петлю «в лоб» нельзя: первая и последняя точки
// совпадают, базовая линия нулевой длины, и алгоритм выкашивает всю петлю в две
// точки. Поэтому режем кольцо в самой дальней от старта точке и упрощаем две
// дуги по отдельности.
function rdpClosed(loop, eps) {
  const [ax, ay] = loop[0];
  let far = 0;
  let dmax = -1;
  loop.forEach(([x, y], i) => {
    const d = Math.hypot(x - ax, y - ay);
    if (d > dmax) {
      dmax = d;
      far = i;
    }
  });
  const head = rdp(loop.slice(0, far + 1), eps);
  const tail = rdp([...loop.slice(far), loop[0]], eps);
  return [...head.slice(0, -1), ...tail.slice(0, -1)];
}

const area = (p) =>
  Math.abs(
    p.reduce((s, [x, y], i) => {
      const [x2, y2] = p[(i + 1) % p.length];
      return s + (x * y2 - x2 * y);
    }, 0) / 2,
  );

export async function traceIcon(src) {
  const { m, w, h, byAlpha } = await readMask(src);
  const box = bounds(m, w, h);
  const small = shrink(m, w, h, box);
  const k = BOX / Math.max(small.w, small.h);
  const offX = (BOX - small.w * k) / 2;
  const offY = (BOX - small.h * k) / 2;

  const loops = contours(small.m, small.w, small.h)
    // Крошки (обрывки сглаживания по краю) выбрасываем: в 24 точках их не видно,
    // а путь они удлиняют.
    .filter((l) => area(l) > 6)
    .map((l) => rdpClosed(l, EPS));

  const d = loops
    .map(
      (l) =>
        l
          .map(([x, y], i) => `${i ? "L" : "M"}${(offX + x * k).toFixed(2)} ${(offY + y * k).toFixed(2)}`)
          .join("") + "Z",
    )
    .join("");

  return { d, loops: loops.length, points: loops.reduce((s, l) => s + l.length, 0), byAlpha };
}

const files = process.argv.slice(2);
if (!files.length) {
  console.log("Использование: node scripts/trace-icon.mjs <png> [<png> …]");
  process.exit(1);
}
for (const f of files) {
  const r = await traceIcon(f);
  console.error(`${f}: петель ${r.loops}, точек ${r.points}, ${r.d.length} байт, фон ${r.byAlpha ? "прозрачный" : "залитый"}`);
  console.log(`<path d="${r.d}" />`);
}
