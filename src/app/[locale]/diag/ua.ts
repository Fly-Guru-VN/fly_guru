// Разбор строки User-Agent для страницы диагностики.
//
// Нужен ровно для одного вопроса: «что за телефон у человека и не слишком ли
// старая на нём система». Полноценный парсер (ua-parser-js и подобные) сюда
// тащить не за чем — нас интересуют iOS, Android и признак встроенного
// браузера мессенджера.

// Нижняя граница, на которую собирается сайт: Next 16 и Tailwind 4 выпускают
// код и стили под Safari 16.4+. На iOS постарше скрипт может не разобраться
// целиком — тогда страница есть, а кнопки мёртвые.
export const MIN_IOS = 16.4;

export interface UaInfo {
  raw: string;
  /** Человеческое название системы: «iOS 16.4», «Android 13». */
  os: string;
  /** Версия iOS числом (16.4) — для сравнения с MIN_IOS. null, если не iOS. */
  iosVersion: number | null;
  /** Чем открыто: «Safari 16.4», «Chrome», «встроенный браузер приложения». */
  browser: string;
  /** Открыто внутри приложения (Telegram, Instagram, Facebook) — там свои причуды. */
  inApp: boolean;
}

const IN_APP = [
  [/FBAN|FBAV|FB_IAB/, "Facebook"],
  [/Instagram/, "Instagram"],
  [/Telegram/, "Telegram"],
  [/Line\//, "LINE"],
  [/(VKApp|OKApp)/, "VK/OK"],
  [/Zalo/, "Zalo"],
] as const;

export function parseUa(raw: string): UaInfo {
  const ua = raw || "";

  // iOS: «CPU iPhone OS 16_4 like Mac OS X». Минорной части может не быть.
  const ios = /(?:iPhone|CPU) OS (\d+)(?:_(\d+))?/.exec(ua);
  const iosVersion = ios ? Number(`${ios[1]}.${ios[2] ?? 0}`) : null;

  const android = /Android (\d+(?:\.\d+)?)/.exec(ua);

  let os = "не определилась";
  if (iosVersion !== null) {
    os = `iOS ${ios![1]}.${ios![2] ?? 0}`;
  } else if (android) {
    os = `Android ${android[1]}`;
  } else if (/Mac OS X/.test(ua)) {
    os = "macOS";
  } else if (/Windows NT/.test(ua)) {
    os = "Windows";
  }

  // Модель айфона в строке не приходит (Apple её не пишет) — только «iPhone».
  const appInApp = IN_APP.find(([re]) => re.test(ua));

  let browser = "не определился";
  if (appInApp) {
    browser = `встроенный браузер ${appInApp[1]}`;
  } else if (/CriOS\/(\d+)/.test(ua)) {
    browser = `Chrome ${/CriOS\/(\d+)/.exec(ua)![1]} (внутри iOS это тот же Safari)`;
  } else if (/FxiOS\/(\d+)/.test(ua)) {
    browser = `Firefox ${/FxiOS\/(\d+)/.exec(ua)![1]} (внутри iOS это тот же Safari)`;
  } else if (/EdgiOS\/(\d+)/.test(ua)) {
    browser = `Edge ${/EdgiOS\/(\d+)/.exec(ua)![1]} (внутри iOS это тот же Safari)`;
  } else if (/Version\/(\d+(?:\.\d+)?).*Safari/.test(ua)) {
    browser = `Safari ${/Version\/(\d+(?:\.\d+)?).*Safari/.exec(ua)![1]}`;
  } else if (/Chrome\/(\d+)/.test(ua)) {
    browser = `Chrome ${/Chrome\/(\d+)/.exec(ua)![1]}`;
  } else if (iosVersion !== null) {
    // iPhone без опознавательных знаков браузера — почти всегда WebView
    // внутри какого-то приложения.
    browser = "встроенный браузер приложения";
  }

  return {
    raw: ua,
    os,
    iosVersion,
    browser,
    inApp: Boolean(appInApp) || (iosVersion !== null && !/Safari|CriOS|FxiOS|EdgiOS/.test(ua)),
  };
}
