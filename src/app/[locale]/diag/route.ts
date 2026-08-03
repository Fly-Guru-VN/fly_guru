import { headers } from "next/headers";
import { MIN_IOS, parseUa } from "./ua";

// Страница-диагност: «почему на этом телефоне ничего не нажимается».
//
// Повод — инструктор с iPhone XR: не открывалась смена (фото выбирается, и
// ничего не происходит) и не открывалось меню сайта, причём в альбомной
// ориентации меню работало. Все три симптома — одно и то же: в браузере не
// выполняется наш JavaScript. Фото на смене отправляет скрипт (ShiftPanel →
// PhotoInput → form.requestSubmit), бургер открывается через onClick, а в
// альбомной ориентации показывается ДРУГОЕ меню — обычные ссылки, которым
// скрипт не нужен. Отсюда и «работает, если перевернуть экран».
//
// Почему это НЕ обычная страница сайта, а отдаваемый руками HTML:
// диагност не должен зависеть от того, что диагностирует. Здесь нет ни React,
// ни Tailwind, ни макета кабинета — только теги и стили в атрибутах. Первая
// версия была страницей на React, и он при гидратации затирал результаты
// проверок: страница «чинила» саму себя и врала.
//
// Проверки устроены «от обратного»: в разметке лежит красное НЕТ, а скрипт в
// браузере переписывает его на зелёное ДА. Не выполнился скрипт — надпись
// осталась красной, это и есть ответ.

export const dynamic = "force-dynamic"; // ответ зависит от заголовков запроса

const OK = "#0a7c2f";
const BAD = "#c81e1e";

// User-Agent приходит от клиента, а страницу мы собираем строкой — значит
// экранируем сами (React бы сделал это за нас, но его здесь нет).
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const ROW = 'style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:12px 0;border-top:1px solid #e1eaef"';
const HINT = 'style="display:block;font-size:13px;color:#55707f;margin-top:2px"';
const VERDICT = `style="white-space:nowrap;font-weight:700;color:${BAD}"`;

// Строка проверки: слева название и подсказка, справа НЕТ, которое перепишет
// скрипт. У проверки стилей ответ подставляет сам CSS (::after), поэтому тег
// там оставляем пустым — иначе на экране было бы два слова подряд.
function row(label: string, id: string, hint: string, text = "НЕТ"): string {
  return `<div ${ROW}><span>${label}<span ${HINT}>${hint}</span></span><b id="${id}" ${VERDICT}>${text}</b></div>`;
}

// Строка со сведениями об устройстве (без вердикта).
function info(label: string, value: string, id?: string): string {
  return `<div ${ROW}><span style="color:#55707f">${label}</span><b${
    id ? ` id="${id}"` : ""
  } style="text-align:right">${value}</b></div>`;
}

// Обычный JS образца 2010 года: он обязан выполниться в любом браузере, где
// скрипты вообще включены. Не выполнился — их выключили в настройках или режет
// блокировщик.
const BASIC_SCRIPT = `(function () {
  function mark(id, ok) {
    var el = document.getElementById(id);
    if (!el) return;
    el.firstChild.nodeValue = ok ? 'ДА' : 'НЕТ';
    el.style.color = ok ? '${OK}' : '${BAD}';
  }
  window.flyguruMark = mark;

  mark('js-basic', true);

  var storage = false;
  try {
    localStorage.setItem('flyguru:diag', '1');
    localStorage.removeItem('flyguru:diag');
    storage = true;
  } catch (e) {}
  mark('js-storage', storage);
  mark('js-cookies', navigator.cookieEnabled === true);

  var screenEl = document.getElementById('js-screen');
  if (screenEl) {
    screenEl.firstChild.nodeValue = window.innerWidth + ' × ' + window.innerHeight +
      ' px, ' + (window.innerHeight > window.innerWidth ? 'вертикально' : 'горизонтально');
  }

  // Осязаемая проверка для человека с телефоном в руках: кнопка обрабатывает
  // нажатие ровно так же, как бургер меню сайта. Число не растёт — и меню не
  // откроется.
  var taps = 0;
  var btn = document.getElementById('tap');
  if (btn) {
    btn.onclick = function () {
      taps = taps + 1;
      btn.firstChild.nodeValue = 'Нажатий: ' + taps;
    };
  }

  // Скачиваются ли файлы самого приложения. Имена у них с хэшами, поэтому
  // берём адрес первого попавшегося куска с главной страницы и пробуем его
  // загрузить: не загрузился — их режет блокировщик или сеть.
  try {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/', true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      var found = xhr.status === 200 &&
        /\\/_next\\/static\\/chunks\\/[^"']+\\.js/.exec(xhr.responseText);
      if (!found) { mark('js-chunk', false); return; }
      var s = document.createElement('script');
      s.src = found[0];
      s.onload = function () { mark('js-chunk', true); };
      s.onerror = function () { mark('js-chunk', false); };
      document.head.appendChild(s);
    };
    xhr.onerror = function () { mark('js-chunk', false); };
    xhr.send();
  } catch (e) {}
})();`;

// Тот же тест, но синтаксисом, который появился в Safari 16.4 — под него
// собираются Next и Tailwind. Движок старее не разберёт скрипт ЦЕЛИКОМ, и
// надпись останется красной: ровно это происходит и с приложением.
const MODERN_SCRIPT = `(function () {
  class Probe { static {} }                 // блок static в классе — Safari 16.4
  if (!/(?<=a)b/.test('ab')) return;        // «перед этим» в поиске — Safari 16.4
  if (window.flyguruMark) window.flyguruMark('js-modern', true);
})();`;

// Проверка стилей — чистым CSS, без скриптов. Tailwind 4 строит цвета на oklch
// и color-mix; не понимает их браузер — сайт выглядит «раздетым».
const STYLE = `body { margin:0; background:#f7fafc; color:#0f2233;
  font:16px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
h1 { font-size:24px; margin:0 0 8px; }
h2 { font-size:18px; margin:28px 0 0; }
#css-modern:after { content:"НЕТ"; color:${BAD}; }
@supports (color: oklch(50% 0.1 200)) and (color: color-mix(in oklab, red, blue)) {
  #css-modern:after { content:"ДА"; color:${OK}; }
}`;

export async function GET() {
  const ua = parseUa((await headers()).get("user-agent") ?? "");
  const oldIos = ua.iosVersion !== null && ua.iosVersion < MIN_IOS;

  const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Диагностика · FlyGuru</title>
<style>${STYLE}</style>
</head>
<body>
<div style="max-width:560px;margin:0 auto;padding:24px 16px 64px">

<h1>Диагностика телефона</h1>
<p style="color:#55707f;margin:0">Откройте эту страницу на телефоне, где что-то не
работает, и покажите её целиком. Красные «НЕТ» — это и есть причина.</p>

${
  oldIos
    ? `<p style="margin-top:16px;padding:14px;border-radius:12px;background:#fdeaea;color:#7a1414;font-weight:700">
Система старее iOS ${MIN_IOS} — сайт собран под неё и выше. Нужно обновить телефон:
Настройки → Основные → Обновление ПО.</p>`
    : ""
}
${
  ua.inApp
    ? `<p style="margin-top:16px;padding:14px;border-radius:12px;background:#fff4e5;color:#7a3d00;font-weight:700">
Страница открыта во встроенном браузере приложения. Откройте её в Safari:
кнопка «…» или «Поделиться» → «Открыть в Safari».</p>`
    : ""
}

<h2>Что работает</h2>
<div style="margin-top:8px">
${row("Скрипты в браузере", "js-basic", "НЕТ → Настройки → Safari → Дополнения → JavaScript")}
${row("Современный синтаксис", "js-modern", `НЕТ → система старее iOS ${MIN_IOS}, нужно обновить`)}
${row("Файлы приложения", "js-chunk", "НЕТ → режет блокировщик рекламы или сеть")}
${row("Современный CSS", "css-modern", "НЕТ → сайт будет выглядеть «раздетым»", "")}
${row("Память браузера", "js-storage", "НЕТ → приватный режим или запрет данных сайта")}
${row("Cookies", "js-cookies", "НЕТ → вход в кабинет работать не будет")}
</div>

<p style="margin-top:16px;color:#55707f">Кнопка ниже сделана так же, как меню сайта
и загрузка фото на смене. Не растёт число — не работают и они.</p>
<button type="button" id="tap" style="width:100%;padding:16px;margin-top:8px;font-size:16px;
font-weight:700;color:#fff;background:#0e8a9e;border:0;border-radius:12px">Нажатий: 0</button>

<h2>Что за устройство</h2>
<div style="margin-top:8px">
${info("Система", esc(ua.os))}
${info("Браузер", esc(ua.browser))}
${info("Экран", "—", "js-screen")}
</div>

<details style="margin-top:16px">
<summary style="color:#55707f">Полная строка браузера (для разработчика)</summary>
<p style="margin-top:8px;padding:12px;border-radius:12px;background:#eef4f7;font-size:13px;word-break:break-all">${
    esc(ua.raw) || "браузер не представился"
  }</p>
</details>

<h2>Если есть красное</h2>
<ol style="margin-top:8px;padding-left:20px;color:#55707f">
<li>Настройки → Safari → Дополнения → JavaScript — включить.</li>
<li>Настройки → Safari → Блокировщики контента — выключить все.</li>
<li>Настройки → Основные → Обновление ПО — обновить систему.</li>
<li>Настройки → Safari → Очистить историю и данные, затем открыть заново.</li>
</ol>

<p style="margin-top:24px"><a href="/" style="color:#0e8a9e">← на сайт</a></p>
</div>

<!-- Скрипты в самом конце: к этому моменту все строки уже в разметке. Второй
     отдельным тегом намеренно — если браузер не осилит его синтаксис, первый
     всё равно отработает. -->
<script>${BASIC_SCRIPT}</script>
<script>${MODERN_SCRIPT}</script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Проверяем «здесь и сейчас» — ответ не должен осесть в кэше телефона.
      "cache-control": "no-store",
    },
  });
}
