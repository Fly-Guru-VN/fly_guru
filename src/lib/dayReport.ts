import type { createClient } from "@/lib/supabase/server";
import { vnPeriod } from "@/lib/dates";
import { MARINA_RATE } from "@/lib/finance";
import { loadInstructors } from "@/lib/staff";
import { failIfReadError } from "@/lib/dbError";
import {
  getSessionShare,
  getShiftPay,
  getSubsShares,
  shiftPayStatus,
  type ShiftPayStatus,
} from "@/lib/salary";
import {
  SUBS_CAT,
  buildPaymentBreakdown,
  type PaymentBreakdown,
  type PaymentInput,
} from "@/lib/payments";

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
//  2. Готовый отчёт для журнала («Смена») отдаётся ТОЛЬКО после закрытия смены
//     — проверку делает вызывающий экран. Это не техническое ограничение, а
//     рычаг: пока не закрыл смену — нечего переписывать в журнал.
//
// С 10.08.2026 этот же расчёт кормит живую вкладку «Сегодня» (instructor/today):
// инструкторы спрашивали, где посмотреть выручку и процент Марины по ходу дня,
// а цифры существовали только вечером. Рычаг закрытия смены никуда не делся —
// он держится не на сокрытии таблицы, а на деньгах: 200 000 ₫ за выход
// начисляются лишь за смену, закрытую по регламенту, и на «Сегодня» это видно
// отдельной строкой (см. myShift ниже).
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

// Что с МОЕЙ сменой прямо сейчас. Это не то же самое, что статус выхода в
// «Статистике»: там судят отработанный день, а здесь день ещё идёт.
//  none    — строки смены на сегодня нет вовсе (не выходил / не открывался);
//  planned — смена стоит в графике, но не открыта;
//  дальше — обычные вердикты регламента (см. lib/salary).
export type MyShiftState = "none" | "planned" | ShiftPayStatus;

export interface MyShift {
  openedAt: string | null;
  closedAt: string | null;
  state: MyShiftState;
}

// Из чего складывается моя ЗП за день — теми же тремя слагаемыми, что в
// «Статистике» за период.
export interface MySalaryParts {
  sessions: number; // моя доля 15% с занятий дня
  shift: number; // 200 000 ₫, если выход уже зачтён
  subs: number; // моя доля абонементного котла за день
}

export interface DayReport {
  date: string;
  counts: DayServiceCount[]; // только непустые строки
  servicesTotal: number; // сколько услуг оказано всего
  sessionsRevenue: number; // чеки занятий дня
  subsRevenue: number; // абонементы, оплаченные в этот день
  subsPaidCount: number; // сколько абонементов оплачено за день
  minutesWrittenOff: number; // списано минут с абонементов
  revenue: number; // всё вместе — с этой суммы считается марина
  marina: number; // 35% площадке
  profitBeforePay: number; // выручка − марина
  payments: PaymentBreakdown; // касса дня по способам оплаты
  crew: DayCrewMember[]; // кто на смене, по убыванию ЗП
  mySalary: number; // моя ЗП за день
  mySalaryParts: MySalaryParts;
  myShift: MyShift;
  crewSalary: number; // ЗП всей смены за день
  profitAfterPay: number; // выручка − марина − ЗП смены
  pendingShifts: number; // сколько выходов ещё не закрыто (суммы подрастут)
}

type ShiftRow = {
  instructor_id: string;
  opened_at: string | null;
  closed_at: string | null;
  bonus_cancelled?: boolean | null;
  users: { name: string } | null;
};

// Смены дня. Повтор запроса без bonus_cancelled (0027) убран 16.08.2026:
// колонка в боевой базе есть, а перечитывание глотало любую ошибку и в отчёте
// дня молча оказывалось «сегодня никто не работал».
async function loadDayShifts(admin: Supabase, date: string): Promise<ShiftRow[]> {
  const { data, error } = await admin
    .from("shifts")
    .select("instructor_id, opened_at, closed_at, bonus_cancelled, users!instructor_id(name)")
    .eq("date", date);

  failIfReadError(error, "не удалось прочитать смены дня");
  return (data ?? []) as unknown as ShiftRow[];
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

  const [sessionsRes, subsRes, shifts, staff] = await Promise.all([
    admin
      .from("sessions")
      .select("amount, minutes_used, payment_methods(name), services(code, category)")
      .eq("date", date),
    admin
      .from("subscriptions")
      .select("price, sold_by, payment_methods(name)")
      .not("paid_at", "is", null)
      .gte("paid_at", range.fromIso)
      .lt("paid_at", range.toIso),
    loadDayShifts(admin, date),
    loadInstructors(admin),
  ]);
  const instructorIds = staff.map((m) => m.id);

  type SessionRow = {
    amount: number | null;
    minutes_used: number | null;
    payment_methods: { name: string } | null;
    services: { code: string | null; category: string | null } | null;
  };
  const sessions = (sessionsRes.data ?? []) as unknown as SessionRow[];

  // Касса дня собирается из тех же строк, что и всё остальное: второй раз в
  // базу за оплатами не ходим (buildPaymentBreakdown считает из готового).
  const payments: PaymentInput[] = [];

  const tally = new Map<string, number>();
  let sessionsRevenue = 0;
  let minutesWrittenOff = 0;
  for (const s of sessions) {
    const key = bucketOf(s.services?.code ?? null, s.services?.category ?? null);
    tally.set(key, (tally.get(key) ?? 0) + 1);
    sessionsRevenue += Number(s.amount ?? 0);
    minutesWrittenOff += s.minutes_used ?? 0;
    payments.push({
      amount: Number(s.amount ?? 0),
      method: s.payment_methods?.name ?? null,
      category: s.services?.category ?? null,
    });
  }
  const counts = BUCKETS.map(({ key, label }) => ({
    key,
    label,
    count: tally.get(key) ?? 0,
  })).filter((row) => row.count > 0);

  type SubRow = {
    price: number | null;
    sold_by: string | null;
    payment_methods: { name: string } | null;
  };
  const subs = (subsRes.data ?? []) as unknown as SubRow[];
  const subsRevenue = subs.reduce((s, r) => s + Number(r.price ?? 0), 0);
  for (const s of subs) {
    payments.push({
      amount: Number(s.price ?? 0),
      method: s.payment_methods?.name ?? null,
      category: SUBS_CAT,
    });
  }
  const revenue = sessionsRevenue + subsRevenue;
  const marina = revenue * MARINA_RATE;

  // ЗП за день — теми же тремя слагаемыми, что в кабинете и в «Расчёте месяца»
  // (lib/salary + котёл абонементов). Считаем один раз на всех, а не вызовом
  // getInstructorStats по каждому человеку: там пять запросов на инструктора.
  //
  // Котёл абонементов считает getSubsShares, а не деление «поровну на всех
  // инструкторов в базе»: уволенные из списка никуда не деваются (их прошлые
  // выходы должны считаться), и делёж на них размывал бы долю работающих.
  // Заодно цифра дня сходится с «Статистикой» и «Расчётом месяца» — они берут
  // ту же функцию.
  const [shiftPay, sessionShare, subsShares] = await Promise.all([
    getShiftPay(admin, range, instructorIds),
    getSessionShare(admin, range, instructorIds),
    getSubsShares(admin, range, staff),
  ]);

  const instructorSet = new Set(instructorIds);

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
        (subsShares.shares.get(s.instructor_id) ?? 0),
      shiftOpen: !s.closed_at,
    }))
    .sort((a, b) => b.salary - a.salary);

  const crewSalary = crew.reduce((s, m) => s + m.salary, 0);

  // Моя ЗП берётся не из crew, а из тех же слагаемых напрямую: на живом экране
  // «Сегодня» человек может ещё не открыть смену (в crew его нет), но доля 15%
  // за уже проведённые занятия у него уже есть — и он должен её видеть.
  const mySalaryParts: MySalaryParts = {
    sessions: sessionShare.get(meId)?.amount ?? 0,
    shift: shiftPay.get(meId)?.amount ?? 0,
    subs: subsShares.shares.get(meId) ?? 0,
  };
  const mySalary =
    mySalaryParts.sessions + mySalaryParts.shift + mySalaryParts.subs;

  const mine = shifts.find((s) => s.instructor_id === meId);
  const myShift: MyShift = {
    openedAt: mine?.opened_at ?? null,
    closedAt: mine?.closed_at ?? null,
    state: !mine
      ? "none"
      : !mine.opened_at
        ? "planned"
        : shiftPayStatus(
            mine.opened_at,
            mine.closed_at,
            Boolean(mine.bonus_cancelled),
          ),
  };

  return {
    date,
    counts,
    servicesTotal: sessions.length,
    sessionsRevenue,
    subsRevenue,
    subsPaidCount: subs.length,
    minutesWrittenOff,
    revenue,
    marina,
    profitBeforePay: revenue - marina,
    payments: buildPaymentBreakdown(payments),
    crew,
    mySalary,
    mySalaryParts,
    myShift,
    crewSalary,
    profitAfterPay: revenue - marina - crewSalary,
    pendingShifts: crew.filter((m) => m.shiftOpen).length,
  };
}
