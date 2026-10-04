// Превью ссылок на сайт (og:image): главная, разделы и товары магазина.
//
// Раньше у всех страниц и языков было одно фото без единого слова (/og.jpg,
// начальник на фойле): по превью в чате не понять, что это школа, где она и
// какую страницу прислали. Теперь у каждой страницы своя карточка:
//   • главная и разделы — фото раздела, «FlyGuru · <раздел>», заголовок
//     первого экрана, «где» и адрес сайта; по картинке на язык;
//   • товары магазина — фото товара, название, цена и бренд; одна картинка на
//     товар: название и цена не переводятся.
// Тексты берём из messages/<язык>.json — те же, что на сайте, своих переводов
// скрипт не заводит. Товары — из справочника src/content/shop.ts.
//
// Скриншот страницы не годится: в превью мессенджер ужимает картинку до
// плашки, и шапка с меню и кнопками превращается в мусор.
//
// Рисуем, как и обложки бота (make-tg-covers.mjs): chromium из кэша
// Playwright + шрифты Google Fonts. Manrope — шрифт сайта; иероглифов в нём
// нет, поэтому для китайского и корейского следом в списке Noto Sans SC/KR.
//
// Запуск (tsx — чтобы прочитать справочник магазина на TypeScript):
//   npx tsx scripts/make-og.mjs            — все картинки
//   npx tsx scripts/make-og.mjs journal    — только один раздел
// Результат: public/og/<язык>.jpg, public/og/<раздел>/<язык>.jpg,
// public/og/product/<товар>.jpg. Пути читает src/lib/og.ts.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { shopProducts } from "../src/content/shop.ts";
import { formatUsd, priceFrom, pricesVary, productCover } from "../src/lib/shop.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(root, "public/og");
const LOGO = path.join(root, "public/brand/flyguru-logo.jpg");
const CHROME_CACHE = path.join(process.env.HOME || "", ".cache/ms-playwright");

// Размер, который ждут WhatsApp, Telegram и Facebook (1.91:1).
const WIDTH = 1200;
const HEIGHT = 630;

const LOCALES = ["ru", "en", "vi", "zh", "ko", "de", "es"];
const PLACE = "Maryna Beach Club";

// Разделы сайта. slug — папка в public/og и ключ в Nav (подпись раздела);
// у главной slug нет. title(m) — заголовок первого экрана страницы.
// photo — фон; pos — какую часть фото оставить, когда оно не 1.91:1.
// zoom + origin — у фото тандема и магазина края вырезаны волной под вёрстку
// страницы: увеличиваем от правого края, чтобы прозрачные кромки слева и снизу
// ушли за рамку.
const PAGES = [
  {
    slug: null,
    title: (m) => [m.Home.titleLine1, m.Home.titleLine2],
    photo: "public/media/video/hero-loop-poster.jpg",
  },
  {
    slug: "training",
    title: (m) => [m.Training.titleLine1, m.Training.titleLine2],
    photo: "public/media/photo/training-hero-3.webp",
    pos: "60% 40%",
  },
  {
    slug: "tandem",
    title: (m) => [m.Tandem.title],
    photo: "public/media/photo/tandem-hero-2.webp",
    pos: "100% 0%",
    zoom: 1.15,
    origin: "right top",
  },
  {
    slug: "club",
    title: (m) => [m.Club.titleLine1, m.Club.titleLine2],
    photo: "public/media/photo/club-3-v-more.webp",
    pos: "70% 50%",
  },
  {
    slug: "prices",
    title: (m) => [m.Prices.title],
    photo: "public/og.jpg",
  },
  {
    slug: "reviews",
    title: (m) => [m.Reviews.titleLine1, m.Reviews.titleLine2],
    photo: "public/media/photo/reviews/hero.webp",
    pos: "70% 40%",
  },
  {
    slug: "contacts",
    title: (m) => [m.Contacts.title],
    photo: "public/media/video/hero-loop-poster.jpg",
  },
  {
    slug: "journal",
    title: (m) => [m.Journal.ogTitle],
    photo: "public/media/photo/ekskursiya.webp",
    pos: "65% 60%",
  },
  {
    slug: "shop",
    title: (m) => [m.Shop.title],
    photo: "public/media/photo/shop/hero.webp",
    pos: "60% 50%",
    zoom: 1.3,
    origin: "right center",
  },
];

const mime = (file) => (file.endsWith(".webp") ? "image/webp" : "image/jpeg");
const dataUri = (file) =>
  `data:${mime(file)};base64,${fs.readFileSync(path.join(root, file)).toString("base64")}`;
const logo = dataUri(path.relative(root, LOGO));

const escape = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const messages = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(fs.readFileSync(path.join(root, `messages/${l}.json`), "utf8"))]),
);

// «Электрофойл в Нячанге — школа FlyGuru» → «Электрофойл в Нячанге».
// У китайского тире двойное (——), отсюда «—+».
const where = (m) => m.Meta.title.split(/\s*—+\s*/)[0];

const HEAD = `<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;700;800&family=Noto+Sans+SC:wght@500;700;800&family=Noto+Sans+KR:wght@500;700;800&display=swap" rel="stylesheet">`;

const BASE_CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; position: relative;
    font-family: Manrope, "Noto Sans SC", "Noto Sans KR", sans-serif;
  }
  .brand { display: flex; align-items: center; gap: 18px; }
  .logo {
    width: 76px; height: 76px; border-radius: 50%; flex: none;
    background: #fff center/112% no-repeat url("${logo}");
    box-shadow: 0 8px 24px rgba(0, 0, 0, .25);
  }
  .name { font-size: 40px; font-weight: 800; letter-spacing: -.01em; }
  .section { font-size: 40px; font-weight: 500; opacity: .85; }
  /* balance — строки примерно равной длины: «Мы всегда / на связи», а не
     «Мы всегда на / связи». */
  h1 {
    font-weight: 800; line-height: 1.04; letter-spacing: -.02em;
    max-width: 700px; font-size: 76px; text-wrap: balance;
  }
  .site {
    margin-top: 34px; display: inline-block;
    padding: 12px 26px; border-radius: 999px;
    background: #ff7a1a; color: #fff; font-size: 28px; font-weight: 700;
  }`;

function pageHtml(page, locale) {
  const m = messages[locale];
  const lines = page.title(m).map(escape).join("<br>");
  const section = page.slug ? `<div class="section">· ${escape(m.Nav[page.slug])}</div>` : "";
  return `<!doctype html><html lang="${locale}"><head>${HEAD}<style>${BASE_CSS}
  body { color: #fff; background: #0b3a4a; }
  .photo {
    position: absolute; inset: 0;
    background: center / cover no-repeat url("${dataUri(page.photo)}");
    background-position: ${page.pos ?? "center"};
    transform: scale(${page.zoom ?? 1});
    transform-origin: ${page.origin ?? "center"};
  }
  /* Затемнение слева: на нём держится текст, а фото справа остаётся ярким. */
  .shade {
    position: absolute; inset: 0;
    background:
      linear-gradient(90deg, rgba(4, 30, 44, .88) 0%, rgba(4, 30, 44, .62) 42%, rgba(4, 30, 44, 0) 72%),
      linear-gradient(0deg, rgba(4, 30, 44, .45) 0%, rgba(4, 30, 44, 0) 35%);
  }
  .wrap { position: absolute; inset: 0; padding: 56px 64px; display: flex; flex-direction: column; }
  .main { margin-top: auto; }
  h1 { text-shadow: 0 2px 18px rgba(0, 0, 0, .35); }
  .where {
    margin-top: 22px; font-size: 30px; font-weight: 500; line-height: 1.3;
    color: rgba(255, 255, 255, .92); max-width: 700px;
  }
</style></head><body>
  <div class="photo"></div>
  <div class="shade"></div>
  <div class="wrap">
    <div class="brand"><div class="logo"></div><div class="name">FlyGuru</div>${section}</div>
    <div class="main">
      <h1>${lines}</h1>
      <div class="where">${escape(where(m))} · ${PLACE}</div>
      <div class="site">flyguru.pro</div>
    </div>
  </div>
</body></html>`;
}

// Карточка товара: слева текст на светлом, справа фото товара — фото у них
// студийные, на белом, и на тёмном фоне смотрелись бы вырезанными.
// Цена: одна — «$14,999», разная по размерам — «$12,999+» (слово «от»
// пришлось бы переводить, а картинка у товара одна на все языки).
function productHtml(p) {
  const price = `${formatUsd(priceFrom(p))}${pricesVary(p) ? "+" : ""}`;
  const photo = dataUri(path.join("public", productCover(p)));
  return `<!doctype html><html lang="en"><head>${HEAD}<style>${BASE_CSS}
  body {
    color: #08384a; display: flex;
    background: linear-gradient(135deg, #e9f8fc 0%, #c7eefb 100%);
  }
  .text { width: 560px; flex: none; padding: 56px 0 56px 64px; display: flex; flex-direction: column; }
  .main { margin-top: auto; }
  .kicker { font-size: 26px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; opacity: .7; }
  h1 { margin-top: 14px; max-width: 480px; }
  .price { margin-top: 18px; font-size: 52px; font-weight: 800; color: #ff7a1a; }
  .pic {
    flex: 1; margin: 40px 40px 40px 0; border-radius: 28px;
    background: #fff center / contain no-repeat url("${photo}");
    background-origin: content-box; padding: 24px;
    box-shadow: 0 20px 50px rgba(8, 56, 74, .14);
  }
</style></head><body>
  <div class="text">
    <div class="brand"><div class="logo"></div><div class="name">FlyGuru</div></div>
    <div class="main">
      <div class="kicker">${escape(p.brand)} · Nha Trang</div>
      <h1>${escape(p.name)}</h1>
      <div class="price">${escape(price)}</div>
      <div class="site">flyguru.pro</div>
    </div>
  </div>
  <div class="pic"></div>
</body></html>`;
}

// Chromium — из кэша Playwright напрямую, как в make-tg-covers.mjs: пакет в
// проекте свежее скачанных браузеров. Путь можно задать: CHROME_PATH=...
const CHROME =
  process.env.CHROME_PATH ||
  fs
    .readdirSync(CHROME_CACHE, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith("chromium-"))
    .map((d) => path.join(CHROME_CACHE, d.name, "chrome-linux64/chrome"))
    .filter((bin) => fs.existsSync(bin))
    .sort()
    .pop();
if (!CHROME) throw new Error("не нашёл chromium — поставьте: npx playwright install chromium");

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });

async function shoot(html, out) {
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  // Заголовки разной длины: немецкий вдвое длиннее китайского. Ужимаем шрифт,
  // пока заголовок не влезет в две строки и не налезет на логотип сверху.
  await page.evaluate(() => {
    const h1 = document.querySelector("h1");
    const main = document.querySelector(".main");
    const brand = document.querySelector(".brand");
    let size = parseFloat(getComputedStyle(h1).fontSize);
    const lineH = () => parseFloat(getComputedStyle(h1).fontSize) * 1.04;
    while (
      size > 40 &&
      (h1.scrollWidth > h1.clientWidth + 1 ||
        h1.offsetHeight > lineH() * 2 + 2 ||
        main.getBoundingClientRect().top < brand.getBoundingClientRect().bottom + 24)
    ) {
      size -= 2;
      h1.style.fontSize = `${size}px`;
    }
  });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await page.screenshot({ path: out, type: "jpeg", quality: 85 });
  console.log(`${path.relative(root, out)} — ${(fs.statSync(out).size / 1024).toFixed(0)} КБ`);
}

// Один раздел: npx tsx scripts/make-og.mjs journal — перерисовать только его,
// не трогая остальные картинки (иначе каждый прогон давал бы diff на десятки
// файлов). Без аргумента — всё, включая товары.
const only = process.argv[2];
for (const p of only ? PAGES.filter((x) => x.slug === only) : PAGES) {
  for (const locale of LOCALES) {
    const dir = p.slug ? path.join(OUT_DIR, p.slug) : OUT_DIR;
    await shoot(pageHtml(p, locale), path.join(dir, `${locale}.jpg`));
  }
}
for (const p of only ? [] : shopProducts) {
  await shoot(productHtml(p), path.join(OUT_DIR, "product", `${p.id}.jpg`));
}

await browser.close();
