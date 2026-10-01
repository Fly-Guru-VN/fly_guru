import { vnShiftDays } from "@/lib/dates";

// Карточка инструктора: заработок по неделям рядом с выплатами за них.
//
// Зачем (просьба David от 01.10.2026). «Осталось выдать» — одно число с
// 1 августа, и по нему не видно, ГДЕ дыра: начальник смотрит «за неделю 612 500,
// а осталось 4 325 000» и не может понять, ошибся он или система. На деле у
// Никиты за 12–18 сентября просто не была внесена выплата — но выяснили это
// только ручной сверкой по неделям. Теперь эту сверку делает экран.
//
// Неделя — СУББОТА…ПЯТНИЦА: школа платит инструкторам в субботу за прошедшие
// 7 дней (так подтвердил David). При неделе пн–вс выплаты с заработком не
// сходятся вовсе.
//
// У выплаты в базе есть только день выдачи, без «за какую неделю» (0043).
// Правило привязки: выплата относится к ПОСЛЕДНЕЙ НЕДЕЛЕ, КОТОРАЯ ЗАКОНЧИЛАСЬ к
// дню выдачи. Выдали в субботу 27.09 — это за 19–25.09; во вторник 15.09 — за
// 5–11.09; в саму пятницу — за неделю, которая в этот день и кончается.
// Проверено на всех выплатах Никиты с августа. Слабое место известно: одна
// выплата сразу за две недели ляжет на одну из них — та покажет «выдано
// больше», а предыдущая «не внесено». Общий остаток при этом верный.
//
// Сумма (заработал − выдано) по всем неделям РОВНО равна «осталось выдать» из
// lib/payroll: тот же накопительный период, те же начисления, те же выплаты.

export const PAY_WEEK_START_DAY = 6; // getUTCDay(): суббота

/** Суббота, с которой начинается платёжная неделя этого дня. */
export function payWeekStart(day: string): string {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
  return vnShiftDays(day, -((dow - PAY_WEEK_START_DAY + 7) % 7));
}

export interface WeekPayout {
  id: string;
  amount: number;
  paidOn: string;
  comment: string | null;
}

// running — неделя ещё идёт, выплачивать за неё рано;
// empty   — не заработал и не получал (выходной, отпуск);
// paid    — выдано ровно заработанное;
// missing — заработал, а выплаты нет;
// short   — выдано меньше заработанного;
// over    — выдано больше заработанного (аванс или две недели одной выплатой).
export type PayWeekStatus =
  | "running"
  | "empty"
  | "paid"
  | "missing"
  | "short"
  | "over";

export interface PayWeek {
  fromDay: string; // суббота
  lastDay: string; // пятница, включительно
  // Без округления: доля дня делится на число сменщиков и бывает дробной.
  // Округляет только экран — тогда сумма diff по неделям ровно равна
  // «осталось выдать», а не расходится на пару донгов.
  earned: number;
  paid: number;
  payouts: WeekPayout[];
  /** earned − paid: плюс — не довыдали, минус — выдали лишнего. */
  diff: number;
  status: PayWeekStatus;
}

/** Недели, где выплаты не хватает: их начальник и ищет в карточке. */
export function isUnderpaid(w: PayWeek): boolean {
  return w.status === "missing" || w.status === "short";
}

function statusOf(earned: number, paid: number, running: boolean): PayWeekStatus {
  if (running) return "running";
  if (earned === 0 && paid === 0) return "empty";
  if (paid === 0) return "missing";
  if (paid < earned) return "short";
  if (paid > earned) return "over";
  return "paid";
}

// Недели от точки отсчёта по ту, в которой сегодня, — старые сначала.
// earnedByDay и payouts вызывающий берёт за тот же накопительный период, что и
// «осталось выдать» (с epoch по today), иначе сумма недель с ним не сойдётся.
export function buildPayWeeks({
  epoch,
  today,
  earnedByDay,
  payouts,
}: {
  epoch: string;
  today: string;
  earnedByDay: Map<string, number>;
  payouts: WeekPayout[];
}): PayWeek[] {
  if (today < epoch) return [];

  const starts: string[] = [];
  for (let d = payWeekStart(epoch); d <= today; d = vnShiftDays(d, 7)) {
    starts.push(d);
  }

  const earned = starts.map(() => 0);
  for (const [day, v] of earnedByDay) {
    if (day < epoch || day > today) continue;
    const i = starts.indexOf(payWeekStart(day));
    if (i >= 0) earned[i] += v;
  }

  const byWeek: WeekPayout[][] = starts.map(() => []);
  for (const p of payouts) {
    // Последняя неделя, закончившаяся к дню выдачи. Выплата раньше конца
    // первой недели (аванс в самом начале) — на первую неделю.
    let i = 0;
    for (let k = starts.length - 1; k >= 0; k--) {
      if (vnShiftDays(starts[k], 6) <= p.paidOn) {
        i = k;
        break;
      }
    }
    byWeek[i].push(p);
  }

  return starts.map((fromDay, i) => {
    const lastDay = vnShiftDays(fromDay, 6);
    const list = byWeek[i].sort((a, b) => a.paidOn.localeCompare(b.paidOn));
    const paid = list.reduce((s, p) => s + p.amount, 0);
    return {
      fromDay,
      lastDay,
      earned: earned[i],
      paid,
      payouts: list,
      diff: earned[i] - paid,
      // Пятница — ещё рабочий день недели: платят в субботу.
      status: statusOf(Math.round(earned[i]), paid, lastDay >= today),
    };
  });
}
