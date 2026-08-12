import type { createClient } from "@/lib/supabase/server";
import { isMissingColumn, loadAllSessions } from "@/lib/sessions";
import { channelLabel } from "@/lib/channels";
import { vnDay } from "@/lib/dates";
import { SUBS_CAT } from "@/lib/payments";
import type { StatsRange } from "@/lib/stats";

// Таблица визитов со «Статистики»: строка = одно занятие. Живёт отдельным
// модулем, потому что тех же строк с теми же фильтрами и сортировкой просит
// выгрузка CSV (/api/admin/visits) — считать их в двух местах значит однажды
// отдать боссу файл, который не сходится с экраном.
//
// Кроме занятий в таблицу встают ПРОДАЖИ АБОНЕМЕНТОВ (флаг sale). Продажа
// живёт в отдельной таблице subscriptions и занятием не является, но в кассе
// периода лежит рядом с чеками, и без неё таблица не сходилась с блоком
// «Деньги по способам оплаты». Дата строки — день ОПЛАТЫ (paid_at): тем же
// правилом абонементы считает вся остальная статистика. Неоплаченные в
// таблицу не попадают — они не деньги, их место в строке «ждут оплату».
//
// Не путать с прокатом ПО абонементу: списание минут — обычная сессия
// (subscription_id заполнен, amount = 0), она была в таблице и осталась.
//
// Период — ДЕНЕЖНЫЙ (money_date, 0042): таблица стоит на «Статистике» под
// выручкой и кассой, и строки в ней обязаны быть теми же, из которых эти суммы
// сложены. Поэтому занятие, оплаченное в прошлом месяце, показывается в
// прошлом — со своей датой занятия и пометкой об оплате (см. paid_on ниже).

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface VisitRow {
  id: string;
  date: string; // день занятия
  paid_on?: string | null; // день оплаты, если платили не в день занятия (0042)
  amount: number;
  minutes_used: number | null;
  subscription_id: string | null;
  client_id: string | null;
  instructor_id: string | null;
  channel: string | null;
  client: { name: string } | null;
  service: { name: string; category: string } | null;
  instructor: { name: string } | null;
  creator: { name: string } | null;
  payment: { name: string } | null;
  sale?: boolean; // строка — продажа абонемента, а не занятие
  sub_minutes?: number | null; // минут в проданном абонементе
}

// Без paid_on — набор колонок, который работал до 0042. На него откатываемся,
// если миграцию ещё не накатили: «Статистика» тогда считает по дате занятия,
// как раньше, вместо того чтобы падать целиком.
const SELECT_CORE =
  "id, date, amount, minutes_used, subscription_id, client_id, instructor_id, channel, " +
  "client:clients!client_id(name), service:services!service_id(name, category), " +
  "instructor:users!instructor_id(name), creator:users!created_by(name), " +
  "payment:payment_methods!payment_method_id(name)";

const SELECT = `${SELECT_CORE}, paid_on`;

// Значение фильтра «пусто»: способ оплаты не проставлен / канал не указан.
// Обычное пустое значение в адресе не отличить от «фильтр не выбран».
export const NONE = "__none__";

// Что показываем в колонке «Чем оплатил» и по чему сортируем. У списания минут
// с абонемента денег в этот день не было — спрашивать способ не с чего, поэтому
// «—», а не «не указан» (последнее означает «деньги были, а чем — забыли»).
export function paymentKey(r: VisitRow): string {
  if (r.amount <= 0) return "—";
  return r.payment?.name ?? "";
}

// Занятие с деньгами, у которого не проставили способ оплаты. Такие строки
// подсвечиваем: по ним не сходится касса.
export function isPaymentMissing(r: VisitRow): boolean {
  return r.amount > 0 && !r.payment?.name;
}

export function channelKey(r: VisitRow): string {
  return channelLabel(r.channel) ?? "";
}

export function serviceLabel(r: VisitRow): string {
  // Три разных строки, которые легко перепутать: продажа абонемента (пришли
  // деньги), прокат по абонементу (списали минуты) и обычное занятие.
  if (r.sale) return `Абонемент ${r.sub_minutes ?? 0} мин · продажа`;
  return r.subscription_id
    ? `Абонемент · ${r.minutes_used ?? 0} мин`
    : (r.service?.name ?? "—");
}

export interface VisitFilters {
  cat?: string; // категория услуги
  inst?: string; // id инструктора
  pay?: string; // название способа оплаты либо NONE
  ch?: string; // канал записи (уже человеческий) либо NONE
}

export function filterVisits(rows: VisitRow[], f: VisitFilters): VisitRow[] {
  return rows.filter((r) => {
    if (f.cat && (r.service?.category ?? "") !== f.cat) return false;
    if (f.inst && r.instructor_id !== f.inst) return false;
    if (f.pay) {
      if (f.pay === NONE ? !isPaymentMissing(r) : (r.payment?.name ?? "") !== f.pay)
        return false;
    }
    if (f.ch) {
      // Канал записи — свойство занятия; у продажи абонемента его нет вовсе,
      // поэтому под любой фильтр канала (включая «без канала») она не подходит.
      if (r.sale) return false;
      const ch = channelKey(r);
      if (f.ch === NONE ? ch !== "" : ch !== f.ch) return false;
    }
    return true;
  });
}

// Сортировка. visitsOf передаём снаружи: счётчик «визитов всего» считается по
// всем сессиям школы, а не по строкам таблицы.
export function sortVisits(
  rows: VisitRow[],
  sort: string,
  dir: string,
  visitsOf: (r: VisitRow) => number,
): VisitRow[] {
  const mul = dir === "a" ? 1 : -1;
  const byText = (a: string, b: string) => mul * a.localeCompare(b, "ru");
  return [...rows].sort((a, b) => {
    switch (sort) {
      case "client":
        return byText(a.client?.name ?? "", b.client?.name ?? "");
      case "service":
        return byText(serviceLabel(a), serviceLabel(b));
      case "amount":
        return mul * (a.amount - b.amount);
      case "payment":
        return byText(paymentKey(a), paymentKey(b));
      case "channel":
        return byText(channelKey(a), channelKey(b));
      case "instructor":
        return byText(a.instructor?.name ?? "", b.instructor?.name ?? "");
      case "creator":
        return byText(a.creator?.name ?? "", b.creator?.name ?? "");
      case "visits":
        return mul * (visitsOf(a) - visitsOf(b));
      default:
        return mul * a.date.localeCompare(b.date);
    }
  });
}

// Проданный и оплаченный абонемент в том же виде, что строка занятия.
const SUBS_SELECT =
  "id, client_id, total_minutes, price, sold_by, paid_at, " +
  "client:clients!client_id(name), seller:users!sold_by(name), " +
  "payment:payment_methods!payment_method_id(name)";

interface SubSaleRow {
  id: string;
  client_id: string | null;
  total_minutes: number | null;
  price: number | null;
  sold_by: string | null;
  paid_at: string | null;
  client: { name: string } | null;
  seller: { name: string } | null;
  payment: { name: string } | null;
}

// Продажа → строка таблицы. Категорию ставим ту же, под которой абонементы
// уже живут в блоке «Деньги по способам оплаты» и в выручке по видам: чипс
// фильтра «Абонементы» и колонка в кассе появляются сами собой.
function saleToRow(s: SubSaleRow): VisitRow {
  return {
    id: s.id,
    date: vnDay(s.paid_at!),
    amount: Number(s.price ?? 0),
    minutes_used: null,
    subscription_id: null, // не списание: сюда смотрит serviceLabel
    client_id: s.client_id,
    // «Откатал» у продажи нет — в обеих колонках тот, кто продал.
    instructor_id: s.sold_by,
    channel: null,
    client: s.client,
    service: { name: "Абонемент", category: SUBS_CAT },
    instructor: s.seller,
    creator: s.seller,
    payment: s.payment,
    sale: true,
    sub_minutes: s.total_minutes,
  };
}

export interface VisitsData {
  rows: VisitRow[]; // занятия периода + продажи абонементов
  sessions: VisitRow[]; // только занятия — счётчики визитов и графики
  visitsOf: (r: VisitRow) => number; // визитов клиента за всё время
}

// Сессии периода + продажи абонементов + счётчик визитов клиента за всю
// историю. Сессии — постранично (lib/sessions): .limit() молча срезал бы и
// выручку периода, и счётчик визитов.
export async function loadVisits(
  supabase: Supabase,
  range: StatsRange,
): Promise<VisitsData> {
  const period = { fromDay: range.fromDay, toDay: range.toDay };
  const [firstTry, { rows: all }, subsRes] = await Promise.all([
    loadAllSessions<VisitRow>(supabase, SELECT, { ...period, by: "money" }),
    loadAllSessions<{ client_id: string | null }>(supabase, "client_id"),
    supabase
      .from("subscriptions")
      .select(SUBS_SELECT)
      .not("paid_at", "is", null)
      .gte("paid_at", range.fromIso)
      .lt("paid_at", range.toIso),
  ]);

  // 0042 не накатана — перечитываем прежним набором колонок и по дате занятия.
  const sessions = isMissingColumn(firstTry.error)
    ? (await loadAllSessions<VisitRow>(supabase, SELECT_CORE, period)).rows
    : firstTry.rows;

  const lifetime = new Map<string, number>();
  for (const r of all) {
    if (!r.client_id) continue;
    lifetime.set(r.client_id, (lifetime.get(r.client_id) ?? 0) + 1);
  }

  const sales = ((subsRes.data ?? []) as unknown as SubSaleRow[]).map(saleToRow);

  return {
    rows: [...sessions, ...sales],
    sessions,
    visitsOf: (r) => (r.client_id ? (lifetime.get(r.client_id) ?? 0) : 0),
  };
}
