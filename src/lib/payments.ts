import type { createClient } from "@/lib/supabase/server";
import { vnPeriod } from "@/lib/dates";
import { MONEY_DATE } from "@/lib/sessions";
import type { StatsRange } from "@/lib/stats";

// Сколько денег пришло каждым способом оплаты (пачка №15, п.4; разбивка по
// видам занятий — пачка №23).
//
// Зачем: в конце дня надо свести наличку с тем, что лежит в кармане, а
// безнал — с выписками. До сих пор способ оплаты был виден только в карточке
// каждой отдельной сессии, и «сколько сегодня взяли наличными» считалось
// глазами по списку. Начальнику этого мало: ему нужен срез за период и в нём
// видно, ЧТО именно оплачивали каждым способом (обучение, тандемы, абонементы).
//
// Считаем и занятия, и абонементы: абонемент оплачивают такими же деньгами,
// и в кассе дня он лежит рядом. День для абонемента — по факту оплаты
// (paid_at), для сессии — по дате занятия: занятие, внесённое задним числом,
// деньгами дня не было, но и разносить одну сущность по двум правилам хуже,
// чем считать так же, как считает вся остальная статистика (lib/finance).
//
// Строка «не указан» — не косметика: именно так вскрылось, что 13 из 14 заявок
// закрывали кнопкой «Выполнена» мимо формы записи и способ оплаты в базу не
// попадал вовсе. Пока такие записи есть, их надо видеть.
//
// Оговорка, которую надо помнить: способ оплаты у сессии ОДИН. Если клиент
// часть дал наличными, часть по QR — в базе этого не разделить, и в такой
// строке вся сумма ляжет на один способ.

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface PaymentLine {
  method: string; // название способа или «не указан»
  amount: number;
  count: number; // сколько оплат
  unknown: boolean; // способ не проставлен — подсветить
  byCategory: Map<string, number>; // вид занятия → сумма (абонементы — SUBS_CAT)
}

export interface DayPayments {
  lines: PaymentLine[]; // по убыванию суммы, «не указан» всегда последним
  total: number;
}

export interface PaymentBreakdown extends DayPayments {
  categories: string[]; // какие виды реально встретились (по убыванию суммы)
  totalByCategory: Map<string, number>;
  count: number; // всего оплат
}

const UNKNOWN = "не указан";

// Абонемент — не услуга из справочника, своей категории у него нет. Ключ
// совпадает с категорией услуг «subscription», которой подписаны абонементные
// позиции прайса: в таблице они встают в одну колонку.
export const SUBS_CAT = "subscription";

/** Одна оплата: сумма, способ (null — не проставлен) и вид занятия. */
export interface PaymentInput {
  amount: number;
  method: string | null;
  category: string | null; // null → «прочее»
}

// Чистая сборка без обращений к базе: страницы, которые уже вычитали сессии
// (например «Статистика» — там сессии тянутся постранично вместе со всем
// остальным), считают разбивку из того, что у них на руках, вторым запросом
// базу не дёргают.
export function buildPaymentBreakdown(payments: PaymentInput[]): PaymentBreakdown {
  const byMethod = new Map<string, PaymentLine>();
  const totalByCategory = new Map<string, number>();

  for (const p of payments) {
    if (p.amount <= 0) continue;
    const method = p.method ?? UNKNOWN;
    const category = p.category || "extra";
    const line = byMethod.get(method) ?? {
      method,
      amount: 0,
      count: 0,
      unknown: method === UNKNOWN,
      byCategory: new Map<string, number>(),
    };
    line.amount += p.amount;
    line.count += 1;
    line.byCategory.set(category, (line.byCategory.get(category) ?? 0) + p.amount);
    byMethod.set(method, line);
    totalByCategory.set(category, (totalByCategory.get(category) ?? 0) + p.amount);
  }

  const lines = [...byMethod.values()].sort((a, b) => {
    if (a.unknown !== b.unknown) return a.unknown ? 1 : -1;
    return b.amount - a.amount;
  });
  const categories = [...totalByCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([c]) => c);

  return {
    lines,
    categories,
    totalByCategory,
    total: lines.reduce((s, l) => s + l.amount, 0),
    count: lines.reduce((s, l) => s + l.count, 0),
  };
}

// Оплаты за произвольный период — тем же запросом, что и за день. Период здесь
// денежный (money_date, 0042): это касса, а в кассе чек лежит в том дне, когда
// пришли деньги, а не когда катались.
export async function getPeriodPayments(
  supabase: Supabase,
  range: StatsRange,
): Promise<PaymentBreakdown> {
  const [sessionsRes, subsRes] = await Promise.all([
    supabase
      .from("sessions")
      .select("amount, payment_methods(name), services(category)")
      .gte(MONEY_DATE, range.fromDay)
      .lt(MONEY_DATE, range.toDay)
      .gt("amount", 0),
    supabase
      .from("subscriptions")
      .select("price, payment_methods(name)")
      .not("paid_at", "is", null)
      .gte("paid_at", range.fromIso)
      .lt("paid_at", range.toIso),
  ]);

  type Row = { payment_methods: { name: string } | null };
  const payments: PaymentInput[] = [];
  for (const r of (sessionsRes.data ?? []) as unknown as (Row & {
    amount: number | null;
    services: { category: string } | null;
  })[]) {
    payments.push({
      amount: Number(r.amount ?? 0),
      method: r.payment_methods?.name ?? null,
      category: r.services?.category ?? null,
    });
  }
  for (const r of (subsRes.data ?? []) as unknown as (Row & {
    price: number | null;
  })[]) {
    payments.push({
      amount: Number(r.price ?? 0),
      method: r.payment_methods?.name ?? null,
      category: SUBS_CAT,
    });
  }

  return buildPaymentBreakdown(payments);
}

// Касса одного дня — карточка дня в календаре. Тот же расчёт, чтобы цифры
// дня и цифры периода не разъезжались.
export async function getDayPayments(
  supabase: Supabase,
  date: string,
): Promise<DayPayments> {
  return getPeriodPayments(supabase, vnPeriod(date, date));
}
