import type { createClient } from "@/lib/supabase/server";
import { loadAllSessions } from "@/lib/sessions";
import { channelLabel } from "@/lib/channels";
import type { StatsRange } from "@/lib/stats";

// Таблица визитов со «Статистики»: строка = одно занятие. Живёт отдельным
// модулем, потому что тех же строк с теми же фильтрами и сортировкой просит
// выгрузка CSV (/api/admin/visits) — считать их в двух местах значит однажды
// отдать боссу файл, который не сходится с экраном.

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface VisitRow {
  id: string;
  date: string;
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
}

const SELECT =
  "id, date, amount, minutes_used, subscription_id, client_id, instructor_id, channel, " +
  "client:clients!client_id(name), service:services!service_id(name, category), " +
  "instructor:users!instructor_id(name), creator:users!created_by(name), " +
  "payment:payment_methods!payment_method_id(name)";

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

export interface VisitsData {
  rows: VisitRow[]; // сессии периода
  visitsOf: (r: VisitRow) => number; // визитов клиента за всё время
}

// Сессии периода + счётчик визитов клиента за всю историю. Обе выборки
// постранично (lib/sessions): .limit() молча срезал бы и выручку периода, и
// счётчик визитов.
export async function loadVisits(
  supabase: Supabase,
  range: StatsRange,
): Promise<VisitsData> {
  const [{ rows }, { rows: all }] = await Promise.all([
    loadAllSessions<VisitRow>(supabase, SELECT, {
      fromDay: range.fromDay,
      toDay: range.toDay,
    }),
    loadAllSessions<{ client_id: string | null }>(supabase, "client_id"),
  ]);

  const lifetime = new Map<string, number>();
  for (const r of all) {
    if (!r.client_id) continue;
    lifetime.set(r.client_id, (lifetime.get(r.client_id) ?? 0) + 1);
  }

  return {
    rows,
    visitsOf: (r) => (r.client_id ? (lifetime.get(r.client_id) ?? 0) : 0),
  };
}
