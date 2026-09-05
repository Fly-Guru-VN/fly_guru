import type { createClient } from "@/lib/supabase/server";
import type { StatsRange } from "@/lib/stats";
import { vnDay, vnShiftDays, vnToday } from "@/lib/dates";
import { failIfReadError } from "@/lib/dbError";
import { closeStatus, openStatus } from "@/lib/shiftRules";
import { staffOn, type StaffMember } from "@/lib/staff";

// Как школа платит за работу на пляже (пачка правок №9, пак 2 — новые правила
// от 2026-07-24).
//
// КОМУ платят по этим правилам — решает не роль «инструктор», а список
// SHIFT_CREW_ROLES в lib/staff: с 21.08.2026 смену открывает любой сотрудник, и
// СММщик, вышедший на пляж, зарабатывает ровно как инструктор. Механик смену
// открывает тоже, но денег за неё не получает — у него оклад за месяц
// (MECHANIC_MONTH_PAY), а босс не получает ничего.
//
// Три слагаемых, два из них поменялись:
//
//  • 200 000 ₫ за выход — но ТОЛЬКО за смену, отработанную по
//    регламенту: закрыта, открыта до 9:00, закрыта после 18:00. Нарушил —
//    за этот выход ноль. Плюс админ может снять премию руками (bonus_cancelled)
//    с причиной: регламент живой — шторм, поломка, подмена.
//    Ставка ходила туда-сюда: 200 000 → 300 000 (пачка №9) → снова 200 000
//    (пачка №15, решение David от 01.08.2026). Цифра живёт в SHIFT_PAY одной
//    строкой — экраны и расчёты берут её оттуда, руками нигде не продублирована.
//  • 15% с сессий делятся НА СМЕНУ ДНЯ: считаем базу дня по всем сессиям
//    инструкторов и раскладываем её поровну между теми, кто в этот день
//    ФАКТИЧЕСКИ вышел. Раньше каждый получал 15% со своих чеков — и тот, кто в
//    паре оформлял записи на себя, забирал долю напарника.
//  • доля абонементного котла — с 08.08.2026 делится ПО ДАТЕ ОПЛАТЫ каждого
//    абонемента, а не по всему периоду сразу (см. getSubsShares ниже).
//
// Кто «на смене» для дележа (правка от 28.07.2026). Раньше считалась любая
// строка shifts — то есть назначенная админом смена давала долю, даже если
// человек не вышел. Теперь порядок такой:
//   1. кто ОТКРЫЛ смену (opened_at заполнен) — назначал её админ или инструктор
//      открыл её сам, не важно: выход открывает фото на пляже, и строка смены
//      заводится на лету с planned=false (см. instructor/actions ensureTodayShift);
//   2. никто не открылся, но смены назначены — делим между назначенными
//      (страховка: человек вышел, а нажать/сфоткаться забыл);
//   3. смен в этот день нет вовсе — 15% уходят тому, кто записал. Так расчёт не
//      теряет деньги, если админ не проставил смены в календаре.
// Сессии, проведённые самим админом, в дележ не идут вообще — он босс, его чек
// не наполняет ЗП инструкторов (та же логика, что в lib/finance).
//
// ВАЖНО про доступ: инструктор по RLS видит только СВОИ сессии, а дележ дня
// требует чужие. Поэтому функции принимают клиента параметром: админские
// экраны передают обычный (у админа RLS отдаёт всё), кабинет инструктора —
// service-role. Наружу инструктору уходит только его собственная доля.

type Supabase = Awaited<ReturnType<typeof createClient>>;

export const SESSION_RATE = 0.15; // доля инструкторов с чеков занятий
export const SUBS_RATE = 0.15; // доля с абонемента — в общий котёл инструкторов
export const SHIFT_PAY = 200_000; // ₫ за выход, отработанный по регламенту

// Почему за выход не заплатили. «paid» — заплатили.
export type ShiftPayStatus =
  | "paid"
  | "notClosed"
  | "lateOpen"
  | "earlyClose"
  | "cancelled";

export const SHIFT_PAY_LABEL: Record<ShiftPayStatus, string> = {
  paid: "зачтён",
  notClosed: "смена не закрыта",
  lateOpen: "открыл после 9:00",
  earlyClose: "закрыл до 18:00",
  cancelled: "премию снял админ",
};

export interface ShiftPayRow {
  date: string;
  status: ShiftPayStatus;
  comment: string | null; // причина, если премию снял админ
}

// Порядок проверок = порядок объяснения человеку: сначала «а смена вообще
// закрыта?», потом время, и лишь потом решение админа — оно перебивает всё.
export function shiftPayStatus(
  openedAt: string | null,
  closedAt: string | null,
  bonusCancelled: boolean,
): ShiftPayStatus {
  if (bonusCancelled) return "cancelled";
  if (!closedAt) return "notClosed";
  if (openStatus(openedAt) !== "onTime") return "lateOpen";
  if (closeStatus(closedAt) !== "ok") return "earlyClose";
  return "paid";
}

interface ShiftRow {
  date: string;
  instructor_id: string;
  opened_at: string | null;
  closed_at: string | null;
  bonus_cancelled?: boolean | null;
  bonus_comment?: string | null;
}

// Смены периода. Колонки премии (0027) в боевой базе есть — повтор запроса
// «а вдруг миграция не накатана» убран 16.08.2026 вместе с остальными такими
// страховками. Он ловил ЛЮБУЮ ошибку, не только «нет колонки», и в конце
// концов возвращал пустой список: смены пропадали молча, а вместе с ними —
// 200 000 ₫ за каждый выход и весь дележ 15% по дням. Ноль в зарплате должен
// быть фактом, а не последствием сбойного запроса (см. lib/dbError).
async function loadShifts(
  client: Supabase,
  range: StatsRange,
): Promise<ShiftRow[]> {
  const { data, error } = await client
    .from("shifts")
    .select("date, instructor_id, opened_at, closed_at, bonus_cancelled, bonus_comment")
    .gte("date", range.fromDay)
    .lt("date", range.toDay);

  failIfReadError(error, "не удалось прочитать смены");
  return (data ?? []) as unknown as ShiftRow[];
}

export interface ShiftPayInfo {
  paidCount: number; // выходы, за которые платим
  unpaidCount: number; // выходы, которые регламент срезал
  plannedCount: number; // смены из графика, которые ещё не отработаны
  amount: number; // paidCount × SHIFT_PAY
  rows: ShiftPayRow[]; // по датам, по возрастанию — чтобы объяснить каждый ноль
}

// Выходы за период по каждому инструктору: сколько зачтено, сколько нет и
// почему. Строки чужих людей вызывающий отфильтрует сам (кабинету инструктора
// нужна только своя).
export async function getShiftPay(
  client: Supabase,
  range: StatsRange,
  crewIds: string[],
): Promise<Map<string, ShiftPayInfo>> {
  const shifts = await loadShifts(client, range);
  const allowed = new Set(crewIds);
  const today = vnToday();

  const byInstructor = new Map<string, ShiftPayInfo>();
  const info = (id: string): ShiftPayInfo => {
    let entry = byInstructor.get(id);
    if (!entry) {
      entry = { paidCount: 0, unpaidCount: 0, plannedCount: 0, amount: 0, rows: [] };
      byInstructor.set(id, entry);
    }
    return entry;
  };

  for (const s of shifts) {
    // Смена босса или механика — не оплачиваемый выход: первым школа за смену
    // не платит вовсе, у второго фикс за месяц (см. staff → SHIFT_CREW_ROLES).
    if (!allowed.has(s.instructor_id)) continue;
    // Смена, которая ещё не отработана (сегодняшняя незакрытая или из будущего
    // графика), — это не «срезанный регламентом выход», а просто не наступивший
    // день. Раньше такие строки шли в unpaidCount, и 8 августа расчёт месяца
    // писал «Выходы (4) · не зачтено 12» — то есть весь остаток графика висел
    // как нарушение. Закрытую смену судим по регламенту в любом случае: закрыть
    // задним числом можно, а вот открыть завтрашний день — нет.
    if (!s.closed_at && s.date >= today) {
      info(s.instructor_id).plannedCount += 1;
      continue;
    }
    const status = shiftPayStatus(
      s.opened_at,
      s.closed_at,
      Boolean(s.bonus_cancelled),
    );
    const entry = info(s.instructor_id);
    entry.rows.push({
      date: s.date,
      status,
      comment: s.bonus_comment ?? null,
    });
    if (status === "paid") {
      entry.paidCount += 1;
      entry.amount += SHIFT_PAY;
    } else {
      entry.unpaidCount += 1;
    }
  }

  for (const entry of byInstructor.values()) {
    entry.rows.sort((a, b) => a.date.localeCompare(b.date));
  }
  return byInstructor;
}

export interface SessionShare {
  amount: number; // 15%, доставшиеся этому инструктору за период
  sharedDays: number; // дни, где сумма делилась со сменщиками
  ownDays: number; // дни без смен — 15% со своих чеков
}

// Кто делит 15% за конкретный день: сначала открывшие смену, если таких нет —
// назначенные. Пустой набор = смен в этот день не было вообще.
function dayCrew(
  opened: Set<string> | undefined,
  planned: Set<string> | undefined,
): Set<string> | null {
  if (opened && opened.size > 0) return opened;
  if (planned && planned.size > 0) return planned;
  return null;
}

interface SessionRow {
  date: string;
  amount: number | null;
  agent_commission: number | null;
  instructor_id: string | null;
}

// ── Начальник на пляже (решение David от 04.09.2026) ────────────────────────
//
// ⚠️ ПРАВИЛО ДЕЙСТВУЕТ С 1 СЕНТЯБРЯ 2026 и назад не смотрит. Август и всё, что
// раньше, должны считаться ровно так, как считались: недели там уже закрыты
// выплатами, отчёты начальнику отправлены, и молчаливый пересчёт задним числом
// сдвинул бы чужие суммы. Отсечка живёт одной строкой — BOSS_DAY_SHARE_FROM;
// её проверяют дележ дня, расчёт прибыли, «Расчёт выплат» и сама отметка
// выхода (admin/actions → openBossShift не заводит смену на день раньше неё).
//
// Босс в полевом составе не числится и никогда не будет: за выход ему не платят
// 200 000 ₫ и котёл абонементов его не касается (см. staff → SHIFT_CREW_ROLES).
// Но катает он сам — и до сих пор его чек выпадал из дня ЦЕЛИКОМ: 15% с него не
// получал никто, включая второго инструктора, который в этот день реально
// работал. Записал начальник клиента на себя — и напарник остался без доли с
// этого занятия.
//
// Теперь начальник входит в дележ дня наравне со всеми, но только в тот день,
// когда он ФАКТИЧЕСКИ вышел, — то есть у него есть смена с opened_at. Её
// заводит сама «Запись клиента», когда босс ставит инструктором себя
// (admin/actions → openBossShift). Назначенная, но не открытая смена у него не
// считается вовсе: планировать смену боссу некому.
//
// Во все остальные дни всё как раньше: его чеки мимо ЗП, это прибыль школы.
// Обратная сторона, о которой знает David: в день выхода босса доля напарника
// уменьшается — база дня растёт на чеки начальника, но делится уже на двоих.
//
// ⚠️ Долю босса эта функция считает, но школа её НИКОМУ НЕ ВЫПЛАЧИВАЕТ: он не
// платит зарплату сам себе, и эти деньги просто остаются в кассе (решение
// David от 04.09.2026). Поэтому в «Расчёте выплат» строки начальника нет, а
// lib/finance складывает в расход только доли полевого состава. Смысл его доли
// ровно один — уменьшить долю напарника до честной половины дня.
export const BOSS_DAY_SHARE_FROM = "2026-09-01"; // раньше — старые правила

function bossDaysFrom(
  shifts: ShiftRow[],
  bossIds: string[],
): Map<string, Set<string>> {
  const bosses = new Set(bossIds);
  const days = new Map<string, Set<string>>();
  for (const s of shifts) {
    if (s.date < BOSS_DAY_SHARE_FROM) continue;
    if (!s.opened_at || !bosses.has(s.instructor_id)) continue;
    const set = days.get(s.instructor_id) ?? new Set<string>();
    set.add(s.date);
    days.set(s.instructor_id, set);
  }
  return days;
}

// Дележ 15% по дням. Возвращаем карту «инструктор → его доля за период».
//
// База дня — чеки сессий инструкторов минус комиссии агентов по ним (агент
// забирает свои 300к сверху, инструктору с них ничего не идёт). Дальше:
//   • кто-то открыл смену → база × 15% делится поровну между открывшими,
//     даже если сессию оформил кто-то другой (в этом и смысл: работали вдвоём);
//   • никто не открылся, но смены назначены → делим между назначенными;
//   • смен нет → каждый получает 15% со своих чеков этого дня.
//
// bossIds — начальники (роль admin): они попадают в дележ только за дни своих
// открытых смен, см. блок выше.
export async function getSessionShare(
  client: Supabase,
  range: StatsRange,
  crewIds: string[],
  bossIds: string[] = [],
): Promise<Map<string, SessionShare>> {
  const [sessionsRes, shifts] = await Promise.all([
    client
      .from("sessions")
      .select("date, amount, agent_commission, instructor_id")
      .gte("date", range.fromDay)
      .lt("date", range.toDay),
    loadShifts(client, range),
  ]);

  failIfReadError(sessionsRes.error, "не удалось прочитать занятия для расчёта зарплаты");
  const allowed = new Set(crewIds);
  const sessions = (sessionsRes.data ?? []) as unknown as SessionRow[];
  // Дни выходов босса считаем ДО базы дня: от них зависит, идут его чеки в
  // дележ или остаются прибылью школы.
  const bossDays = bossDaysFrom(shifts, bossIds);
  const worksThatDay = (id: string, date: string): boolean =>
    allowed.has(id) || Boolean(bossDays.get(id)?.has(date));

  // День → база (сессии тех, кто в этот день в составе) и вклад каждого.
  const dayBase = new Map<string, number>();
  const dayOwn = new Map<string, Map<string, number>>();
  for (const s of sessions) {
    const id = s.instructor_id;
    if (!id || !worksThatDay(id, s.date)) continue;
    const net = Math.max(
      0,
      Number(s.amount ?? 0) - Number(s.agent_commission ?? 0),
    );
    if (net === 0) continue; // списание минут: чека нет, делить нечего
    dayBase.set(s.date, (dayBase.get(s.date) ?? 0) + net);
    let own = dayOwn.get(s.date);
    if (!own) {
      own = new Map();
      dayOwn.set(s.date, own);
    }
    own.set(id, (own.get(id) ?? 0) + net);
  }

  // День → кто фактически открыл смену и кому она просто назначена (дубли
  // гасим: у одного человека день = одна смена).
  const dayOpened = new Map<string, Set<string>>();
  const dayPlanned = new Map<string, Set<string>>();
  for (const s of shifts) {
    if (!worksThatDay(s.instructor_id, s.date)) continue;
    const target = s.opened_at ? dayOpened : dayPlanned;
    const set = target.get(s.date) ?? new Set<string>();
    set.add(s.instructor_id);
    target.set(s.date, set);
  }

  const result = new Map<string, SessionShare>();
  const share = (id: string): SessionShare => {
    let entry = result.get(id);
    if (!entry) {
      entry = { amount: 0, sharedDays: 0, ownDays: 0 };
      result.set(id, entry);
    }
    return entry;
  };

  for (const [date, base] of dayBase) {
    const crew = dayCrew(dayOpened.get(date), dayPlanned.get(date));
    const pay = base * SESSION_RATE;
    if (crew) {
      const each = pay / crew.size;
      for (const id of crew) {
        const entry = share(id);
        entry.amount += each;
        entry.sharedDays += 1;
      }
    } else {
      for (const [id, net] of dayOwn.get(date) ?? []) {
        const entry = share(id);
        entry.amount += net * SESSION_RATE;
        entry.ownDays += 1;
      }
    }
  }

  return result;
}

// ── ЗП СММщика (prompt 11, п.3; решение David от 12.08.2026) ─────────────────
//
// Считается не как у инструкторов: смен и занятий у него нет, есть фикс —
// 2 000 000 ₫ за неделю работы. Дробить неделю на дни по 285 714 ₫ David не
// захотел: такую цифру нельзя проверить в уме.
//
// ⚠️ Начисляем ПО СУББОТАМ (решение David от 17.08.2026). Раньше считались
// полные 7-дневки от точки отсчёта — неделя закрывалась в конце пятницы, и в
// саму субботу, когда деньги реально выдают, начисления за неё ещё не было:
// экран показывал «Переплата». По факту школа платит недельщикам каждую
// субботу, поэтому суббота = начисление. Не выдали в субботу — сумма спокойно
// висит в «осталось выдать» до следующей.
//
// Второе слагаемое, 1% с выручки, здесь НЕ считается вовсе: он уже живёт в
// lib/finance как половина CRM_RATE («Ромчик (СММ)») и закрывается помесячно.
// Начислить его ещё раз значило бы задвоить расход школы.
export const SMM_WEEK_PAY = 2_000_000; // ₫ за неделю работы СММщика
export const DEV_WEEK_PAY = 2_500_000; // ₫ за неделю работы разработчика (0044)

export interface WeeklyFixedPay {
  weeks: number; // сколько суббот-выплат пришло за период
  nextPayday: string; // ближайшая суббота, за которую ещё не начислено
  amount: number; // weeks × ставка
}

const SATURDAY = 6; // getUTCDay(): день выплаты недельщикам

// Ближайшая суббота, считая от указанного дня; сам день, если это суббота.
function saturdayFrom(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + ((SATURDAY - d.getUTCDay() + 7) % 7));
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

// Недельный фикс: сколько суббот прошло за период — столько и ставок. Правило
// David'а, одно на всех, у кого ставка недельная: СММщик (2 млн) и
// разработчик (2,5 млн).
//
// Границы периода включительно, приём и увольнение обрезают его с краёв (даты
// из 0036). Хвост в будущем тоже обрезается сегодняшним днём: период по
// умолчанию — текущая неделя пн–вс, и без обрезки её суббота начислялась бы
// уже в понедельник, за неотработанные дни.
export function getWeeklyFixedPay(
  weekPay: number,
  fromDay: string,
  lastDay: string,
  member?: StaffMember,
): WeeklyFixedPay {
  const today = vnToday();
  const start =
    member?.hiredAt && member.hiredAt > fromDay ? member.hiredAt : fromDay;
  const hardEnd = member?.leftAt && member.leftAt < lastDay ? member.leftAt : lastDay;
  const end = hardEnd > today ? today : hardEnd;
  const first = saturdayFrom(start);
  const weeks = end < first ? 0 : Math.floor(daysBetween(first, end) / 7) + 1;
  return {
    weeks,
    // Суббота, следующая за последней учтённой: за неё начислим, когда придёт.
    nextPayday: vnShiftDays(first, weeks * 7),
    amount: weeks * weekPay,
  };
}

export function getSmmFixedPay(
  fromDay: string,
  lastDay: string,
  member?: StaffMember,
): WeeklyFixedPay {
  return getWeeklyFixedPay(SMM_WEEK_PAY, fromDay, lastDay, member);
}

// ── Месячный фикс: механик (решение David от 21.08.2026) ────────────────────
//
// Механик открывает смену как все, но за выход не получает ничего: у него
// оклад 10 000 000 ₫ в месяц. До сих пор ставки в системе не было вовсе — он
// появлялся в «Расчёте выплат», только если ему уже платили, и «сколько школа
// должна» приходилось держать в голове.
//
// Правило то же, что у недельщиков, только шаг месяц: начисляем за ЗАКРЫТЫЙ
// месяц. Пока месяц идёт, сумма висит напоминалкой у ника и в долг не попадает
// — школа не должна за неотработанные дни (та же логика, что с 1% СММщика).
//
// Неполный месяц (приняли или уволили в середине) считается пропорционально
// отработанным дням: полный оклад за три дня работы — это неправда, которую
// потом вычитают руками. Полный месяц всегда ровно ставка, без дробей.
export const MECHANIC_MONTH_PAY = 10_000_000; // ₫ в месяц

export interface MonthlyFixedPay {
  months: number; // закрытые месяцы, за которые начислено
  amount: number; // начислено за закрытые месяцы — это и есть долг
  current: number; // идущий месяц: напоминалка, в долг не идёт
  currentMonth: string | null; // первый день идущего месяца (для подписи)
  nextPayday: string; // когда идущий месяц закроется и станет долгом
}

function monthEndOf(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1, 0); // «нулевое» число следующего месяца
  return d.toISOString().slice(0, 10);
}

function nextMonthStart(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1, 1);
  return d.toISOString().slice(0, 10);
}

export function getMonthlyFixedPay(
  monthPay: number,
  fromDay: string,
  lastDay: string,
  member?: StaffMember,
): MonthlyFixedPay {
  const today = vnToday();
  const start =
    member?.hiredAt && member.hiredAt > fromDay ? member.hiredAt : fromDay;
  const hardEnd = member?.leftAt && member.leftAt < lastDay ? member.leftAt : lastDay;
  // Хвост в будущем отрезаем: за ещё не наступившие дни не начисляем.
  const end = hardEnd > today ? today : hardEnd;

  let months = 0;
  let amount = 0;
  let current = 0;
  let currentMonth: string | null = null;

  let cursor = `${start.slice(0, 7)}-01`;
  while (cursor <= end) {
    const monthEnd = monthEndOf(cursor);
    const workedFrom = cursor > start ? cursor : start;
    const workedTo = monthEnd < end ? monthEnd : end;
    if (workedTo >= workedFrom) {
      const worked = daysBetween(workedFrom, workedTo) + 1;
      const inMonth = daysBetween(cursor, monthEnd) + 1;
      const share =
        worked === inMonth ? monthPay : Math.round((monthPay * worked) / inMonth);
      // Месяц (или его отработанная часть) уже позади — начисляем.
      if (workedTo < today) {
        months += 1;
        amount += share;
      } else {
        current = share;
        currentMonth = cursor;
      }
    }
    cursor = nextMonthStart(cursor);
  }

  return {
    months,
    amount,
    current,
    currentMonth,
    nextPayday: currentMonth ? nextMonthStart(currentMonth) : nextMonthStart(end),
  };
}

export interface SubsShares {
  pool: number; // весь котёл периода: 15% с абонементов, которые делятся
  shares: Map<string, number>; // инструктор → его доля
  soldCount: Map<string, number>; // инструктор → сколько продал сам (справка)
  /**
   * Инструктор → СО СКОЛЬКИХ абонементов сложилась его доля (просьба
   * начальника от 25.08.2026). Это не то же самое, что soldCount: доля идёт с
   * КАЖДОГО абонемента, оплаченного в дни, когда человек был в деле, кто бы
   * его ни продал. Пока на экране стояла одна цифра «продал сам», выходило
   * непонятное: продал один, а денег пришло как за пять.
   */
  sharedCount: Map<string, number>;
}

interface PoolSubRow {
  price: number | null;
  paid_at: string | null;
  sold_by: string | null;
  pool_share: boolean | null; // продажу босса всё равно делят в котёл (0048)
}

// Котёл абонементов: 15% с каждого абонемента, ПРОДАННОГО полевым составом и
// оплаченного в периоде. Абонемент админа в котёл не идёт — он босс, его
// продажа остаётся ему (та же логика, что с сессиями в lib/finance).
//
// Исключение — флаг pool_share (0048, решение David от 21.08.2026): босс может
// сказать «эту продажу делим с ребятами», и тогда её 15% уходят в котёл
// наравне с инструкторскими. Сам продавец при этом доли НЕ получает: он всё
// ещё босс, и делят те же сменщики дня оплаты, что и обычный абонемент. До
// этого флага такую продажу можно было провести только записав её на
// инструктора — то есть соврав в поле «Продал» и испортив ему справку
// «сам продал N штук».
//
// Дележ (правка от 08.08.2026, пачка №25). Раньше котёл складывался за весь
// период и делился поровну между всеми, кто числится инструктором СЕЙЧАС. Из-за
// этого:
//   • уволенный в середине недели получал долю с абонементов, оплаченных уже
//     после его ухода — а стоило его удалить, он терял и заслуженную часть;
//   • принятый в середине месяца, наоборот, получал долю за дни, когда его в
//     школе ещё не было.
// Теперь каждый абонемент делится отдельно — между теми, кто был в штате В ДЕНЬ
// ЕГО ОПЛАТЫ (lib/staff → worksOn). Живой пример: четверо, Михаила уволили 5-го.
// Абонемент, оплаченный до 5-го, делится на четверых (по 225 000 ₫), следующий —
// на троих (по 300 000 ₫). Ровно так, как просил начальник, и без ручных правок.
//
// staff — ВЕСЬ полевой состав, включая уволенных: их надо учитывать в расчётах
// за прошлые периоды. Кто в доле за конкретный день, решают даты.
//
// Исключение — те, у кого есть вторая работа и второй оклад (сейчас это
// СММщик, решение David от 21.08.2026). В штате он каждый день, но пляж — не
// его основная работа: долю котла он получает только за дни, когда РЕАЛЬНО
// открыл смену. Иначе доля инструкторов размывалась бы человеком, который в
// этот день сидел в офисе и уже получает за него недельный фикс.
export async function getSubsShares(
  client: Supabase,
  range: StatsRange,
  staff: StaffMember[],
): Promise<SubsShares> {
  const [{ data, error }, shifts] = await Promise.all([
    client
      .from("subscriptions")
      .select("price, paid_at, sold_by, pool_share")
      .not("paid_at", "is", null)
      .gte("paid_at", range.fromIso)
      .lt("paid_at", range.toIso),
    loadShifts(client, range),
  ]);

  failIfReadError(error, "не удалось прочитать абонементы для расчёта зарплаты");

  // День → кто в этот день открыл смену. Нужен только «второй работе»: у
  // инструктора выходной долю котла не отнимает, это его основной оклад.
  const openedByDay = new Map<string, Set<string>>();
  for (const sh of shifts) {
    if (!sh.opened_at) continue;
    const set = openedByDay.get(sh.date) ?? new Set<string>();
    set.add(sh.instructor_id);
    openedByDay.set(sh.date, set);
  }

  const byId = new Map(staff.map((m) => [m.id, m]));
  const shares = new Map<string, number>();
  const soldCount = new Map<string, number>();
  const sharedCount = new Map<string, number>();
  let pool = 0;

  // Деньги и счётчик абонементов идут вместе: каждый раз, когда человеку падает
  // доля, ему же засчитывается ещё один абонемент в знаменатель объяснения.
  const add = (id: string, amount: number) => {
    shares.set(id, (shares.get(id) ?? 0) + amount);
    sharedCount.set(id, (sharedCount.get(id) ?? 0) + 1);
  };

  for (const raw of (data ?? []) as unknown as PoolSubRow[]) {
    const seller = raw.sold_by;
    if (!seller || !raw.paid_at) continue;
    // Продал полевой состав — котёл всегда. Продал босс — только с галочкой
    // «в общий котёл» (0048); без неё продажа, как и раньше, мимо котла.
    const fromCrew = byId.has(seller);
    if (!fromCrew && !raw.pool_share) continue;

    // Справка «сам продал N штук» — про полевые продажи: в кабинете её видит
    // инструктор рядом со своей долей. Босса в этих списках нет.
    if (fromCrew) soldCount.set(seller, (soldCount.get(seller) ?? 0) + 1);
    const cut = Number(raw.price ?? 0) * SUBS_RATE;
    if (cut <= 0) continue;

    // День оплаты по вьетнамскому времени: paid_at — timestamptz, а «в штате
    // 5-го» считается по местному календарю, а не по UTC.
    const day = vnDay(raw.paid_at);
    const opened = openedByDay.get(day);
    const crew = staffOn(staff, day).filter(
      (m) => m.role === "instructor" || opened?.has(m.id),
    );
    if (crew.length === 0) {
      // Делить не с кем. У полевой продажи такого быть не должно (продавец сам
      // был в штате в день оплаты), и если даты выставили криво — деньги не
      // растворяются, а остаются продавцу. А вот продажу босса в такой день
      // просто не делим: отдать её ему же значит записать боссу долю котла.
      if (fromCrew) {
        pool += cut;
        add(seller, cut);
      }
      continue;
    }
    pool += cut;
    const each = cut / crew.length;
    for (const m of crew) add(m.id, each);
  }

  return { pool, shares, soldCount, sharedCount };
}
