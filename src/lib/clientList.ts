import type { createClient } from "@/lib/supabase/server";
import { loadAllClients } from "@/lib/clients";
import { loadAllSessions } from "@/lib/sessions";
import { phoneDigits } from "@/lib/phone";

// Список клиентов с поиском и сортировкой — общий для экрана «Клиенты» (админ и
// СММщик) и его выгрузки в Excel. Считается в одном месте, чтобы файл не мог
// разойтись с тем, что человек видит на экране.

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface ClientListRow {
  id: string;
  name: string;
  phone: string | null;
  source: string;
  referrer_type: string | null;
  referrer_id: string | null;
  internal_note: string | null;
  age: number | null;
  city: string | null;
  tour_approved: boolean;
  telegram_username: string | null;
  photo_path: string | null;
  // Legacy до 0052: используем только для извлечения пути, наружу не отдаём.
  photo_url: string | null;
  created_at: string;
}

/** Откуда пришёл клиент — подпись для карточки и для выгрузки. */
export const SOURCE_LABEL: Record<string, string> = {
  site: "с сайта",
  offline: "офлайн",
  agent: "от агента",
  member: "по рекомендации члена клуба",
};

const CLIENT_COLUMNS =
  "id, name, phone, source, referrer_type, referrer_id, internal_note, age, city, tour_approved, telegram_username, photo_path, photo_url, created_at";

// Три поля сессии, из которых считаются занятия, траты и последний визит.
interface SessionRow {
  client_id: string | null;
  amount: number | null;
  date: string;
}

export interface VisitStats {
  sessions: number;
  spent: number;
  lastVisit: string | null;
}

/**
 * Все клиенты (для счётчика «Всего»), найденные по запросу и отсортированные,
 * плюс занятия/траты/последний визит каждого. Сессии берутся по ВСЕМ клиентам:
 * сортировка по занятиям/тратам/визиту ранжирует весь список, а не первую
 * страницу.
 */
export async function loadClientList(
  supabase: Supabase,
  { q, sort }: { q: string; sort: string },
): Promise<{
  all: ClientListRow[];
  sorted: ClientListRow[];
  visits: (id: string) => VisitStats;
}> {
  const [{ rows: allClients }, { rows: allSessions }] = await Promise.all([
    // Постранично (lib/clients): .limit(1000) молча обрезал бы базу клиентов —
    // поиск переставал бы находить всех, кто не попал в первую тысячу.
    loadAllClients<ClientListRow>(supabase, CLIENT_COLUMNS),
    // Тоже постранично (lib/sessions): .limit(10000) молча занизил бы
    // и число занятий, и сумму трат у клиентов.
    loadAllSessions<SessionRow>(supabase, "client_id, amount, date"),
  ]);
  // Загрузчик отдаёт по id — восстанавливаем прежний порядок «новые сверху».
  const all = [...allClients].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );

  // Поиск в JS: телефоны в базе разноформатные, сравниваем цифры с цифрами,
  // имя — без учёта регистра. На сотнях клиентов это дешевле индексов.
  const needle = q.trim().toLowerCase();
  const needleDigits = phoneDigits(needle);
  const found = needle
    ? all.filter(
        (c) =>
          c.name.toLowerCase().includes(needle) ||
          (needleDigits.length >= 3 &&
            phoneDigits(c.phone ?? "").includes(needleDigits)),
      )
    : all;

  const byId = new Map<string, VisitStats>();
  const visits = (id: string): VisitStats => {
    let s = byId.get(id);
    if (!s) {
      s = { sessions: 0, spent: 0, lastVisit: null };
      byId.set(id, s);
    }
    return s;
  };
  for (const r of allSessions) {
    const s = visits(r.client_id as string);
    s.sessions += 1;
    s.spent += (r.amount as number) ?? 0;
    if (!s.lastVisit || r.date > s.lastVisit) s.lastVisit = r.date;
  }

  // Сортировка. «Новые» — как пришло из базы (created_at desc). Метрики — по
  // убыванию; клиенты без значения (нет визитов / возраст не указан) — в конце.
  const sorted = [...found];
  if (sort === "sessions") {
    sorted.sort((a, b) => visits(b.id).sessions - visits(a.id).sessions);
  } else if (sort === "spent") {
    sorted.sort((a, b) => visits(b.id).spent - visits(a.id).spent);
  } else if (sort === "visit") {
    sorted.sort((a, b) =>
      (visits(b.id).lastVisit ?? "").localeCompare(visits(a.id).lastVisit ?? ""),
    );
  } else if (sort === "age") {
    sorted.sort((a, b) => (b.age ?? -1) - (a.age ?? -1));
  }

  return { all, sorted, visits };
}

// Сколько id за раз кладём в .in(...): список уходит прямо в адрес запроса, и
// на «показать ещё» × несколько раз сотни uuid упёрлись бы в длину URL.
const IN_CHUNK = 100;

/**
 * Запрос с .in(...) по любому числу id — пачками по IN_CHUNK, результаты
 * склеиваются. Пустой список — пустой ответ без похода в базу. Ошибки, как и
 * раньше на экране, превращаются в «нет строк»: бейдж не покажется, но
 * список клиентов не упадёт.
 */
export async function selectIn<T>(
  ids: string[],
  run: (chunk: string[]) => PromiseLike<{ data: unknown[] | null }>,
): Promise<T[]> {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    chunks.push(ids.slice(i, i + IN_CHUNK));
  }
  const results = await Promise.all(chunks.map((c) => run(c)));
  return results.flatMap((r) => (r.data ?? []) as T[]);
}
