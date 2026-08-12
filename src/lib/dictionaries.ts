import type { createClient } from "@/lib/supabase/server";

// Справочники, которые админ ведёт сам (пачка правок №4, пак A):
//  • expense_categories — категории расходов (аренда, топливо, инвентарь…);
//  • payment_methods — форматы оплаты (наличные, QR, T-Bank, перевод…);
//  • booking_channels — каналы записи (пляжи, звонок, Instagram…; 0041).
//
// Все устроены одинаково: имя + флаг active. Скрытая позиция (active=false)
// пропадает из выпадашек, но остаётся в старых записях — историю не переписываем.

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface DictItem {
  id: string;
  name: string;
  active: boolean;
}

export type DictTable =
  | "expense_categories"
  | "payment_methods"
  | "booking_channels";

// Человеческие названия — для текстов ошибок и заголовков, чтобы не плодить
// строковые литералы по экшенам.
export const DICT_LABEL: Record<DictTable, string> = {
  expense_categories: "категория расхода",
  payment_methods: "формат оплаты",
  booking_channels: "канал записи",
};

// Каналы записи для форм: только имена и только активные. Отдельная функция,
// потому что запрашивают её из четырёх мест (заявка у админа и механика,
// записи у админа и инструктора), и везде нужен один и тот же простой список
// строк — ChannelField хранит текст, а не id справочника (см. lib/channels).
// Справочник появился в 0041: пока миграция не накатана, таблицы нет и запрос
// падает — тогда отдаём пустой список, и форма покажет только «Другой…».
export async function getChannelNames(supabase: Supabase): Promise<string[]> {
  const { data, error } = await supabase
    .from("booking_channels")
    .select("name")
    .eq("active", true)
    .order("created_at");
  if (error) {
    console.error("[dictionaries] booking_channels load error:", error.message);
    return [];
  }
  return ((data ?? []) as { name: string }[]).map((r) => r.name);
}

// Имя способа оплаты из встроенного запроса `payment:payment_methods(name)`.
// Связь у заявки к одному, но типы supabase-js описывают вложенную выборку
// массивом — разворачиваем в одном месте, чтобы не сыпать приведениями по
// страницам. Нужно там, где способ мог быть скрыт в справочнике: select в форме
// не нашёл бы своего значения, и его надо дорисовать запасным пунктом.
export function embeddedName(value: unknown): string | null {
  const row = Array.isArray(value) ? value[0] : value;
  const name = (row as { name?: unknown } | null | undefined)?.name;
  return typeof name === "string" ? name : null;
}

// Только видимые позиции — для форм.
export async function getActiveDict(
  supabase: Supabase,
  table: DictTable,
): Promise<DictItem[]> {
  const { data, error } = await supabase
    .from(table)
    .select("id, name, active")
    .eq("active", true)
    .order("name");
  if (error) {
    console.error(`[dictionaries] ${table} load error:`, error.message);
    return [];
  }
  return (data ?? []) as DictItem[];
}

// Все позиции, включая скрытые — для экрана управления в настройках.
// Активные сверху: с ними работают каждый день, скрытые — архив внизу.
export async function getFullDict(
  supabase: Supabase,
  table: DictTable,
): Promise<DictItem[]> {
  const { data, error } = await supabase
    .from(table)
    .select("id, name, active")
    .order("active", { ascending: false })
    .order("name");
  if (error) {
    console.error(`[dictionaries] ${table} load error:`, error.message);
    return [];
  }
  return (data ?? []) as DictItem[];
}
