// Обложки для служебных сообщений в Telegram.
//
// Зачем они вообще. Бот шлёт в чаты три вида сообщений со ссылкой в кабинет:
// «открыть смену», «закрыть смену», «новая заявка». Ссылки ведут на /instructor
// и /admin — страницы за логином, и телеграм, когда идёт за превью, получает
// редирект на /login с общими OG-тегами сайта. Поэтому у всех трёх сообщений
// была одна и та же картинка — /og.jpg, начальник на фойле.
//
// Чинить OG-теги бесполезно: страницу за логином боту не отдать. Поэтому
// сообщения уходят как ФОТО с подписью (sendPhoto), а фото — вот эти обложки:
// что на картинке, то и в сообщении, гадать мессенджеру не надо.
//
// Рисуем в браузере (chromium из кэша Playwright) и снимаем скриншот: шрифт
// сайта Manrope живёт в Google Fonts, а системного аналога с кириллицей тут
// нет. Правки текста и цвета — в COVERS ниже, потом прогнать скрипт заново.
//
// Запуск: node scripts/make-tg-covers.mjs
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(root, "public/tg");
const LOGO = path.join(root, "public/brand/flyguru-logo.jpg");
const CHROME_CACHE = path.join(process.env.HOME || "", ".cache/ms-playwright");

const WIDTH = 1280;
const HEIGHT = 720;

// Цвета подобраны так, чтобы обложку было видно по одному цветовому пятну в
// ленте чата, ещё до текста: утро светло-голубое, вечер тёмно-синий, заявка
// жёлто-оранжевая. Оттенки из палитры «Sunrise Sea» (globals.css) взяты как
// основа, но разведены сильнее — три похожих бирюзы в чате не различались.
//
// ink — цвет текста: на светлых фонах белый не читается, там тёмный.
// wave — цвет декоративной волны, по той же причине.
const COVERS = [
  {
    file: "shift-open.jpg",
    from: "#c7eefb",
    to: "#56c2e2",
    ink: "#08384a",
    wave: "rgba(255, 255, 255, .5)",
    kicker: "FlyGuru · смена",
    title: "Открытие<br>смены",
    note: "Фото на пляже открывает смену",
  },
  {
    file: "shift-close.jpg",
    from: "#33529b",
    to: "#0a1730",
    ink: "#ffffff",
    wave: "rgba(255, 255, 255, .12)",
    kicker: "FlyGuru · смена",
    title: "Закрытие<br>смены",
    note: "Фото у бара закрывает смену",
  },
  {
    file: "booking.jpg",
    from: "#ffd23f",
    to: "#ff7a1a",
    ink: "#3b1a00",
    wave: "rgba(255, 255, 255, .34)",
    kicker: "FlyGuru · заявки",
    title: "Новая<br>заявка",
    note: "Клиент ждёт ответа",
  },
];

const logoDataUri = `data:image/jpeg;base64,${fs.readFileSync(LOGO).toString("base64")}`;

// Волна внизу — та же форма, что у декора на сайте: белая с прозрачностью,
// чтобы обложки читались как одна семья, а не три случайные картинки.
const wave = (color) => `<svg class="wave" viewBox="0 0 1280 220" preserveAspectRatio="none">
  <path d="M0 96 C 200 30, 360 170, 640 110 S 1080 30, 1280 92 L1280 220 L0 220 Z" fill="${color}" opacity=".62"/>
  <path d="M0 140 C 220 80, 420 200, 700 148 S 1100 90, 1280 138 L1280 220 L0 220 Z" fill="${color}"/>
</svg>`;

function html(cover) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;700;800&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden;
    font-family: Manrope, sans-serif; color: ${cover.ink};
    background: linear-gradient(135deg, ${cover.from} 0%, ${cover.to} 100%);
    display: flex; align-items: center; gap: 56px; padding: 0 84px;
    position: relative;
  }
  .wave { position: absolute; left: 0; bottom: 0; width: 100%; height: 220px; }
  .text { flex: 1; position: relative; z-index: 1; }
  .kicker {
    font-size: 30px; font-weight: 700; letter-spacing: .18em; text-transform: uppercase;
    opacity: .78; margin-bottom: 26px;
  }
  h1 { font-size: 104px; font-weight: 800; line-height: .98; letter-spacing: -.02em; }
  .note {
    margin-top: 32px; font-size: 34px; font-weight: 500; line-height: 1.3;
    opacity: .9; max-width: 15em;
  }
  .logo {
    position: relative; z-index: 1;
    width: 340px; height: 340px; border-radius: 50%;
    background: #fff center/112% no-repeat url("${logoDataUri}");
    box-shadow: 0 30px 70px rgba(15, 34, 51, .3);
    flex: none;
  }
</style></head><body>
  ${wave(cover.wave)}
  <div class="text">
    <div class="kicker">${cover.kicker}</div>
    <h1>${cover.title}</h1>
    <div class="note">${cover.note}</div>
  </div>
  <div class="logo"></div>
</body></html>`;
}

fs.mkdirSync(OUT_DIR, { recursive: true });

// Chromium берём из кэша Playwright напрямую: пакет в проекте обновляется
// чаще, чем скачанные браузеры, и launch() без пути ищет версию, которой на
// машине нет. Путь можно переопределить: CHROME_PATH=/usr/bin/chromium.
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

for (const cover of COVERS) {
  await page.setContent(html(cover), { waitUntil: "networkidle" });
  // Ждём именно шрифт: без этого первый кадр иногда снимается системным
  // запасным шрифтом, и обложка уезжает по ширине.
  await page.evaluate(() => document.fonts.ready);
  const out = path.join(OUT_DIR, cover.file);
  await page.screenshot({ path: out, type: "jpeg", quality: 90 });
  console.log(`${cover.file} — готово (${(fs.statSync(out).size / 1024).toFixed(0)} КБ)`);
}

await browser.close();
