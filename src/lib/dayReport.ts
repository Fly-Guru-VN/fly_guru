import type { createClient } from "@/lib/supabase/server";
import { vnPeriod } from "@/lib/dates";
import { getInstructorIds } from "@/lib/stats";
import { MARINA_RATE } from "@/lib/finance";
import { SUBS_RATE, getSessionShare, getShiftPay } from "@/lib/salary";

// Отчёт за день для журнала Marina Beach (пачка №15, п.1 — просьба инструктора).
//
// Каждый вечер инструктор от руки заносит в журнал марины: сколько и каких
// услуг школа оказала, сколько собрала денег и сколько с этого отдаёт площадке.
// Раньше он считал это в уме по своим записям в CRM — отсюда и просьба
// «покажите готовые цифры».
//
// Два решения, которые здесь зашиты:
//
//  1. Цифры — по ВСЕЙ школе за день, а не по своим сессиям. В журнал марины
//     заносится итог по пляжу: если на смене двое, у каждого своя половина
//     записей, а комиссия площадке считается с общей суммы. Личная у человека
//     только строка «моя ЗП».
//
//  2. Отчёт отдаётся ТОЛЬКО после закрытия смены (проверку делает вызывающий
//     экран). Это не техническое ограничение, а рычаг: пока не закрыл смену —
//     нечего переписывать в журнал. Люди забывали закрываться, и выход им не
//     засчитывался (см. lib/salary) — теперь закрытие стало нужно им самим.
//
// Разбивка по типажам — та же, что в журнале марины: тандем детский, тандем
// взрослый, обучение, прокат. Смотрим на services.code, а не на название:
// название админ может переписать в любой момент, код вечен (0010, 0024).

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Строка «услуга — сколько раз оказали». label совпадает с формулировкой в
// журнале, чтобы переписывать можно было не думая.
export interface DayServiceCount {
  key: string;
  label: string;
  count: number;
}

// Порядок строк = порядок в журнале марины.
const BUCKETS: { key: string; label: string }[] = [
  { key: "tandem-adult", label: "Тандем взрослый" },
  { key: "tandem-kid", label: "Тандем детский" },
  { key: "training", label: "Обучение" },
  { key: "rental", label: "Прокат" },
  { key: "other", label: "Другое (экскурсии, фото/видео)" },
  { key: "writeoff", label: "По абонементу (списание минут)" },
];

// Куда отнести сессию. Тандемы — поимённо по коду (в журнале детский и
// взрослый идут разными строками), остальное — по категории услуги.
// Сессия без услуги вообще — это списание минут абонемента (lib/instructor
// actions: service_id пуст, amount 0): услуга оказана, денег нет.
function bucketOf(code: string | null, category: string | null): string {
  if (!category) return "writeoff";
  if (code === "tandem-adult" || code === "tandem-kid") return code;
  if (category === "training") return "training";
  if (category === "rental") return "rental";
  return "other";
}

// Кто был на смене и сколько ему причитается за этот день.
export interface DayCrewMember {
  id: string;
  name: string;
  salary: number;
  /** Смена ещё не закрыта — выход в его сумму пока не вошёл. */
  shiftOpen: boolean;
}

export interface DayReport {
  date: string;
  counts: DayServiceCount[]; // только непустые строки
  servicesTotal: number; // сколько услуг оказано всего
  sessionsRevenue: number; // чеки занятий дня
  subsRevenue: number; // абонементы, оплаченные в этот день
  revenue: number; // всё вместе — с этой суммы считается марина
  marina: number; // 35% площадке
  profitBeforePay: number; // выручка − марина
  crew: DayCrewMember[]; // кто на смене, по убыванию ЗП
  mySalary: number; // моя ЗП за день
  crewSalary: number; // ЗП всей смены за день
  profitAfterPay: number; // выручка − марина − ЗП смены
  pendingShifts: number; // сколько выходов ещё не закрыто (суммы подрастут)
}

// meId — чью ЗП показать отдельной строкой.
//
// ВАЖНО про клиента: инструктор по RLS видит только свои сессии и не видит
// чужие смены, а отчёт по определению общий. Поэтому сюда передают
// service-role-клиент (как в дележе 15% — см. lib/salary). Наружу уходят
// суммы по школе, которые человек и так переписывает в журнал марины.
export async function getDayReport(
  admin: Supabase,
  date: string,
  meId: string,
): Promise<DayReport> {
  const range = vnPeriod(date, date);

  const [sessionsRes, subsRes, shiftsRes, instructorIds] = await Promise.all([
    admin
      .from("sessions")
      .select("amount, minutes_used, services(code, category)")
      .eq("date", date),
    admin
      .from("subscriptions")
      .select("price, sold_by")
      .not("paid_at", "is", null)
      .gte("paid_at", range.fromIso)
      .lt("paid_at", range.toIso),
    admin
      .from("shifts")
      .select("instructor_id, opened_at, closed_at, users!instructor_id(name)")
      .eq("date", date),
    getInstructorIds(admin),
  ]);

  type SessionRow = {
    amount: number | null;
    minutes_used: number | null;
    services: { code: string | null; category: string | null } | null;
  };
  const sessions = (sessionsRes.data ?? []) as unknown as SessionRow[];

  const tally = new Map<string, number>();
  let sessionsRevenue = 0;
  for (const s of sessions) {
    const key = bucketOf(s.services?.code ?? null, s.services?.category ?? null);
    tally.set(key, (tally.get(key) ?? 0) + 1);
    sessionsRevenue += Number(s.amount ?? 0);
  }
  const counts = BUCKETS.map(({ key, label }) => ({
    key,
    label,
    count: tally.get(key) ?? 0,
  })).filter((row) => row.count > 0);

  const subs = (subsRes.data ?? []) as { price: number | null; sold_by: string | null }[];
  const subsRevenue = subs.reduce((s, r) => s + Number(r.price ?? 0), 0);
  const revenue = sessionsRevenue + subsRevenue;
  const marina = revenue * MARINA_RATE;

  // ЗП за день — теми же тремя слагаемыми, что в кабинете и в «Расчёте месяца»
  // (lib/salary + котёл абонементов). Считаем один раз на всех, а не вызовом
  // getInstructorStats по каждому человеку: там пять запросов на инструктора.
  const [shiftPay, sessionShare] = await Promise.all([
    getShiftPay(admin, range, instructorIds),
    getSessionShare(admin, range, instructorIds),
  ]);

  const instructorSet = new Set(instructorIds);
  const poolBase = subs
    .filter((s) => s.sold_by && instructorSet.has(s.sold_by))
    .reduce((s, r) => s + Number(r.price ?? 0), 0);
  const subsShare =
    instructorIds.length > 0 ? (poolBase * SUBS_RATE) / instructorIds.length : 0;

  type ShiftRow = {
    instructor_id: string;
    opened_at: string | null;
    closed_at: string | null;
    users: { name: string } | null;
  };
  const shifts = (shiftsRes.data ?? []) as unknown as ShiftRow[];

  // На смене — те, кто её ОТКРЫЛ. Назначенная, но не открытая смена в отчёт не
  // идёт: человек не вышел, ЗП за день у него нулевая (та же логика, что в
  // дележе 15%). Механик в списке не появится — он не в instructorIds.
  const crew: DayCrewMember[] = shifts
    .filter((s) => s.opened_at && instructorSet.has(s.instructor_id))
    .map((s) => ({
      id: s.instructor_id,
      name: s.users?.name ?? "Инструктор",
      salary:
        (sessionShare.get(s.instructor_id)?.amount ?? 0) +
        (shiftPay.get(s.instructor_id)?.amount ?? 0) +
        subsShare,
      shiftOpen: !s.closed_at,
    }))
    .sort((a, b) => b.salary - a.salary);

  const crewSalary = crew.reduce((s, m) => s + m.salary, 0);

  return {
    date,
    counts,
    servicesTotal: sessions.length,
    sessionsRevenue,
    subsRevenue,
    revenue,
    marina,
    profitBeforePay: revenue - marina,
    crew,
    mySalary: crew.find((m) => m.id === meId)?.salary ?? 0,
    crewSalary,
    profitAfterPay: revenue - marina - crewSalary,
    pendingShifts: crew.filter((m) => m.shiftOpen).length,
  };
}
