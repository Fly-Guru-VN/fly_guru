import type { createClient } from "@/lib/supabase/server";
import { vnPeriod } from "@/lib/dates";

// Сколько денег за день пришло каждым способом оплаты (пачка №15, п.4).
//
// Зачем: в конце дня надо свести наличку с тем, что лежит в кармане, а
// безнал — с выписками. До сих пор способ оплаты был виден только в карточке
// каждой отдельной сессии, и «сколько сегодня взяли наличными» считалось
// глазами по списку.
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

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface PaymentLine {
  method: string; // название способа или «не указан»
  amount: number;
  count: number; // сколько оплат
  unknown: boolean; // способ не проставлен — подсветить
}

export interface DayPayments {
  lines: PaymentLine[]; // по убыванию суммы, «не указан» всегда последним
  total: number;
}

const UNKNOWN = "не указан";

export async function getDayPayments(
  supabase: Supabase,
  date: string,
): Promise<DayPayments> {
  const range = vnPeriod(date, date);

  const [sessionsRes, subsRes] = await Promise.all([
    supabase
      .from("sessions")
      .select("amount, payment_methods(name)")
      .eq("date", date)
      .gt("amount", 0),
    supabase
      .from("subscriptions")
      .select("price, payment_methods(name)")
      .not("paid_at", "is", null)
      .gte("paid_at", range.fromIso)
      .lt("paid_at", range.toIso),
  ]);

  type Row = { payment_methods: { name: string } | null };
  const byMethod = new Map<string, PaymentLine>();
  const add = (name: string | null, amount: number) => {
    if (amount <= 0) return;
    const method = name ?? UNKNOWN;
    const line = byMethod.get(method) ?? {
      method,
      amount: 0,
      count: 0,
      unknown: method === UNKNOWN,
    };
    line.amount += amount;
    line.count += 1;
    byMethod.set(method, line);
  };

  for (const r of (sessionsRes.data ?? []) as unknown as (Row & {
    amount: number | null;
  })[]) {
    add(r.payment_methods?.name ?? null, Number(r.amount ?? 0));
  }
  for (const r of (subsRes.data ?? []) as unknown as (Row & {
    price: number | null;
  })[]) {
    add(r.payment_methods?.name ?? null, Number(r.price ?? 0));
  }

  const lines = [...byMethod.values()].sort((a, b) => {
    if (a.unknown !== b.unknown) return a.unknown ? 1 : -1;
    return b.amount - a.amount;
  });

  return { lines, total: lines.reduce((s, l) => s + l.amount, 0) };
}
