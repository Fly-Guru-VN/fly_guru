import type { createClient } from "@/lib/supabase/server";
import type { createAdminClient } from "@/lib/supabase/admin";

// Загрузка сессий целиком, без тихого потолка. Брат-близнец lib/clients —
// та же болезнь, те же грабли.
//
// Что было не так. В четырёх местах стояло `.limit(10000)`: список клиентов с
// колонками «занятий» и «потрачено», дашборд (сессии периода + визиты за всё
// время) и такой же список у инструктора. Пока сессий десятки, это правда
// работает. Но на 10001-й PostgREST молча отдаст первые десять тысяч — и
// сломается всё ТИХО: у клиента занизится число визитов и сумма трат, сортировка
// «по тратам» переставит людей местами, а в дашборде поедет выручка периода.
// Ни ошибки, ни строчки в логе — просто цифры станут неправильными.
//
// Как сейчас. Читаем страницами по 1000, пока страницы полные. Порядок по id:
// без order у range нет гарантии, что страницы не перекроются и не потеряют
// строки. Сегодня это один запрос; десять тысяч сессий — это годы работы школы.
//
// Когда это перестанет годиться: если сессий станут сотни тысяч, счётчики по
// клиенту надо будет считать на стороне базы (group by или матвью), а не
// вычитывать всю таблицу в память. Тогда чинить — здесь.

type Supabase =
  | Awaited<ReturnType<typeof createClient>>
  | ReturnType<typeof createAdminClient>;

const PAGE_SIZE = 1000;

export interface LoadSessionsOptions {
  /** Только сессии этого инструктора (кабинет инструктора). */
  instructorId?: string;
  /** Начало периода включительно, 'YYYY-MM-DD'. */
  fromDay?: string;
  /** Конец периода исключительно, 'YYYY-MM-DD'. */
  toDay?: string;
}

/**
 * Все сессии с нужными колонками. Колонки передаёт вызывающий: дашборду нужна
 * широкая выборка со связями, спискам клиентов — три поля.
 *
 * Ошибку возвращаем текстом, а не кидаем: вызывающие страницы показывают её
 * сами и решают, рисовать ли остальное.
 */
export async function loadAllSessions<T>(
  supabase: Supabase,
  columns: string,
  options: LoadSessionsOptions = {},
): Promise<{ rows: T[]; error: string | null }> {
  const rows: T[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase.from("sessions").select(columns).order("id");
    if (options.instructorId) query = query.eq("instructor_id", options.instructorId);
    if (options.fromDay) query = query.gte("date", options.fromDay);
    if (options.toDay) query = query.lt("date", options.toDay);

    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) return { rows, error: error.message };

    const page = (data ?? []) as unknown as T[];
    rows.push(...page);
    // Неполная страница = сессии кончились. Ровно кратное число даст один
    // лишний пустой запрос — это дешевле, чем гадать.
    if (page.length < PAGE_SIZE) break;
  }

  return { rows, error: null };
}
