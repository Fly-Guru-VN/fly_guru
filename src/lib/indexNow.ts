import { SITE_URL } from "@/lib/site";

// IndexNow — «сообщить поисковику, что страница изменилась». Поддерживают
// Bing и Яндекс (и те, кто берёт выдачу у Bing). Google протокол НЕ
// поддерживает: он находит новые страницы сам, по sitemap.xml и ссылкам.
//
// Как это работает: шлём список адресов на api.indexnow.org, а поисковик
// проверяет, что запрос пришёл от владельца сайта, — скачивает файл
// /<ключ>.txt с нашего домена и сверяет содержимое. Поэтому ключ НЕ секрет:
// он и так лежит в public/ и виден любому. Новый ключ — новый файл в public/.
//
// Шлём только с боевого сайта (VERCEL_ENV=production): с localhost и превью
// поисковик получил бы адреса, которых на www.flyguru.pro ещё нет.
export const INDEXNOW_KEY = "3de24abe3746ca6fd401bfd3191b31c3";

const ENDPOINT = "https://api.indexnow.org/indexnow";

export function indexNowPayload(urls: string[]) {
  return {
    host: new URL(SITE_URL).host,
    key: INDEXNOW_KEY,
    keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
    // Только свои адреса и без повторов: чужой адрес поисковик отбросит вместе
    // со всем запросом.
    urlList: [...new Set(urls)].filter((u) => u.startsWith(`${SITE_URL}/`)),
  };
}

export function indexNowEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.VERCEL_ENV === "production";
}

// Никогда не бросает: уведомление поисковика — приятное дополнение, а не
// условие публикации. Не дошло — поисковик всё равно найдёт страницу сам.
export async function pingIndexNow(urls: string[]): Promise<void> {
  if (!indexNowEnabled()) return;
  const payload = indexNowPayload(urls);
  if (payload.urlList.length === 0) return;
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    // 200 и 202 — принято. 403 — поисковик не нашёл файл с ключом на сайте.
    if (!res.ok) console.error(`[indexnow] ${res.status} ${await res.text().catch(() => "")}`);
  } catch (e) {
    console.error("[indexnow] не отправлено:", e instanceof Error ? e.message : e);
  }
}
