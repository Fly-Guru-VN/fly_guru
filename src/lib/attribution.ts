// «Память о том, откуда пришёл гость» (атрибуция трафика).
//
// Простыми словами: когда человек заходит на сайт по рекламной ссылке, в адресе
// бывают метки — откуда он пришёл (?src=instagram, ?utm_source=ig, ?ref=КОД и
// т.п.). Проблема: кликнуть по рекламе и оставить заявку человек может в разные
// дни. Поэтому при заходе мы запоминаем эти метки прямо в браузере гостя
// (localStorage — крошечное хранилище внутри браузера) и держим их 30 дней.
// Когда он позже оставит заявку — мы достанем метки и приложим к заявке.
//
// «last-touch» (последнее касание): если гость пришёл ещё раз с новыми метками —
// новые перезаписывают старые. То есть учитывается самый свежий источник.

// Метки, которые ищем в адресе страницы.
const TRACKED_KEYS = [
  "ref", // реф-код (ссылка агента/члена клуба) → пойдёт в bookings.ref_code
  "src", // источник простыми словами: instagram, qr, flyer… → bookings.src
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid", // идентификатор клика Google Ads
  "fbclid", // идентификатор клика Facebook/Instagram
] as const;

type TrackedKey = (typeof TRACKED_KEYS)[number];
export type Attribution = Partial<Record<TrackedKey, string>>;

const STORAGE_KEY = "flyguru_attribution";
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 дней в миллисекундах

interface StoredAttribution {
  data: Attribution;
  ts: number; // время последнего касания (Date.now())
}

// Прочитать сохранённые метки. Если их нет или они «протухли» (старше 30 дней) —
// вернуть пустой объект.
function readStored(): Attribution {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredAttribution;
    if (!parsed.ts || Date.now() - parsed.ts > TTL_MS) {
      window.localStorage.removeItem(STORAGE_KEY);
      return {};
    }
    return parsed.data ?? {};
  } catch {
    // Битые данные в localStorage — просто игнорируем.
    return {};
  }
}

function writeStored(data: Attribution): void {
  if (typeof window === "undefined") return;
  try {
    const payload: StoredAttribution = { data, ts: Date.now() };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // localStorage может быть недоступен (приватный режим и т.п.) — не критично.
  }
}

// Забрать из текущего адреса страницы все метки, которые там есть.
function readFromUrl(): Attribution {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const found: Attribution = {};
  for (const key of TRACKED_KEYS) {
    const value = params.get(key);
    if (value) found[key] = value.slice(0, 200); // обрезаем на всякий случай
  }
  return found;
}

// Главная функция «поймать метки». Вызывается на каждой странице при заходе.
// Если в адресе есть хоть одна метка — сливаем её с уже сохранёнными
// (новые перезаписывают старые) и обновляем срок жизни.
//
// Возвращает то, что нашла в адресе: вызывающий по этому решает, отмечать ли
// переход в статистике (см. Attribution.tsx). Пустой объект — в адресе меток
// не было, человек просто ходит по сайту.
export function captureAttribution(): Attribution {
  const fromUrl = readFromUrl();
  if (Object.keys(fromUrl).length === 0) return {}; // в адресе ничего нет — не трогаем
  const merged = { ...readStored(), ...fromUrl };
  writeStored(merged);
  return fromUrl;
}

// Разложить метки адреса так, как их ждёт счётчик переходов (api/ref-visits):
// src отдельно, всё остальное (utm_*, gclid, fbclid) — в кучу. Реф-код сюда не
// попадает: переходы по /r/<code> отмечает сам лендинг.
export function splitMarksForHit(marks: Attribution): {
  src: string | null;
  utm: Record<string, string>;
} {
  const { ref: _ref, src, ...rest } = marks;
  void _ref;
  return { src: src ?? null, utm: rest as Record<string, string> };
}

// Явно записать реф-код (используется на лендинге /r/[code], где код лежит не в
// query-параметре, а в самом пути). Тоже продлевает 30-дневное окно.
export function captureRefCode(code: string): void {
  if (!code) return;
  const merged = { ...readStored(), ref: code };
  writeStored(merged);
}

// Забыть реф-код, оставив остальные метки. Нужно, когда сервер ответил, что
// код не принят (владельца нет: ссылка с опечаткой, агента давно удалили).
// Без этого мусорный код лежал бы в браузере все 30 дней и лез в каждую
// следующую заявку с этого устройства — так и появлялись «сиротские» коды
// в базе. Источник (src/utm) при этом честный, его сохраняем.
export function forgetRefCode(): void {
  const stored = readStored();
  if (!stored.ref) return;
  const rest = { ...stored };
  delete rest.ref;
  writeStored(rest);
}

// Собрать метки в том виде, в каком их ждёт заявка (booking):
//   ref → ref_code, src → src, всё остальное (utm_*, gclid, fbclid) → utm (jsonb).
export function getAttributionForBooking(): {
  ref_code: string | null;
  src: string | null;
  utm: Record<string, string>;
} {
  const data = readStored();
  const { ref, src, ...rest } = data;
  return {
    ref_code: ref ?? null,
    src: src ?? null,
    utm: rest as Record<string, string>,
  };
}
