// Превью ссылки на сайт (og:image) — по картинке на каждый язык.
//
// Раньше у всех страниц и языков было одно фото без единого слова (/og.jpg,
// начальник на фойле): по превью в чате не понять, что это школа и где она.
// Теперь карточка: кадр из ролика на главной, логотип, заголовок главной,
// «где» и адрес сайта. Тексты берём из messages/<язык>.json — те же, что на
// сайте, своих переводов скрипт не заводит.
//
// Скриншот главной не годится: в превью мессенджер ужимает картинку до
// плашки, и шапка с меню и кнопками превращается в мусор.
//
// Рисуем, как и обложки бота (make-tg-covers.mjs): chromium из кэша
// Playwright + шрифты Google Fonts. Manrope — шрифт сайта; иероглифов в нём
// нет, поэтому для китайского и корейского следом в списке Noto Sans SC/KR.
//
// Запуск: node scripts/make-og.mjs → public/og/<язык>.jpg
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(root, "public/og");
const LOGO = path.join(root, "public/brand/flyguru-logo.jpg");
const PHOTO = path.join(root, "public/media/video/hero-loop-poster.jpg");
const CHROME_CACHE = path.join(process.env.HOME || "", ".cache/ms-playwright");

// Размер, который ждут WhatsApp, Telegram и Facebook (1.91:1).
const WIDTH = 1200;
const HEIGHT = 630;

const LOCALES = ["ru", "en", "vi", "zh", "ko", "de", "es"];
const PLACE = "Maryna Beach Club";

const dataUri = (file) =>
  `data:image/jpeg;base64,${fs.readFileSync(file).toString("base64")}`;
const logo = dataUri(LOGO);
const photo = dataUri(PHOTO);

const escape = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function texts(locale) {
  const m = JSON.parse(fs.readFileSync(path.join(root, `messages/${locale}.json`), "utf8"));
  return {
    line1: m.Home.titleLine1,
    line2: m.Home.titleLine2,
    // «Электрофойл в Нячанге — школа FlyGuru» → «Электрофойл в Нячанге».
    // У китайского тире двойное (——), отсюда «—+».
    where: m.Meta.title.split(/\s*—+\s*/)[0],
  };
}

function html(locale) {
  const t = texts(locale);
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;700;800&family=Noto+Sans+SC:wght@500;700;800&family=Noto+Sans+KR:wght@500;700;800&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; position: relative;
    font-family: Manrope, "Noto Sans SC", "Noto Sans KR", sans-serif; color: #fff;
    background: #0b3a4a center / cover no-repeat url("${photo}");
  }
  /* Затемнение слева: на нём держится текст, а доска и город справа
     остаются яркими. */
  .shade {
    position: absolute; inset: 0;
    background:
      linear-gradient(90deg, rgba(4, 30, 44, .88) 0%, rgba(4, 30, 44, .62) 42%, rgba(4, 30, 44, 0) 72%),
      linear-gradient(0deg, rgba(4, 30, 44, .45) 0%, rgba(4, 30, 44, 0) 35%);
  }
  .wrap {
    position: absolute; inset: 0; padding: 56px 64px;
    display: flex; flex-direction: column;
  }
  .brand { display: flex; align-items: center; gap: 18px; }
  .logo {
    width: 76px; height: 76px; border-radius: 50%; flex: none;
    background: #fff center/112% no-repeat url("${logo}");
    box-shadow: 0 8px 24px rgba(0, 0, 0, .3);
  }
  .name { font-size: 40px; font-weight: 800; letter-spacing: -.01em; }
  .main { margin-top: auto; }
  h1 {
    font-weight: 800; line-height: 1.04; letter-spacing: -.02em;
    max-width: 700px; font-size: 76px;
    text-shadow: 0 2px 18px rgba(0, 0, 0, .35);
  }
  .where {
    margin-top: 22px; font-size: 30px; font-weight: 500; line-height: 1.3;
    color: rgba(255, 255, 255, .92); max-width: 700px;
  }
  .site {
    margin-top: 34px; display: inline-block;
    padding: 12px 26px; border-radius: 999px;
    background: #ff7a1a; font-size: 28px; font-weight: 700;
  }
</style></head><body>
  <div class="shade"></div>
  <div class="wrap">
    <div class="brand"><div class="logo"></div><div class="name">FlyGuru</div></div>
    <div class="main">
      <h1>${escape(t.line1)}<br>${escape(t.line2)}</h1>
      <div class="where">${escape(t.where)} · ${PLACE}</div>
      <div class="site">flyguru.pro</div>
    </div>
  </div>
</body></html>`;
}

fs.mkdirSync(OUT_DIR, { recursive: true });

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

for (const locale of LOCALES) {
  await page.setContent(html(locale), { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  // Заголовки разной длины: немецкий вдвое длиннее китайского. Ужимаем шрифт,
  // пока заголовок не влезет в две строки и в высоту блока.
  await page.evaluate(() => {
    const h1 = document.querySelector("h1");
    const main = document.querySelector(".main");
    const brand = document.querySelector(".brand");
    let size = 76;
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
  const out = path.join(OUT_DIR, `${locale}.jpg`);
  await page.screenshot({ path: out, type: "jpeg", quality: 85 });
  console.log(`${locale}.jpg — готово (${(fs.statSync(out).size / 1024).toFixed(0)} КБ)`);
}

await browser.close();
