import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  dayShort,
  monthLabel,
  vnCurrentMonth,
  vnPrevMonth,
  vnPrevWeek,
  vnShiftDays,
  vnToday,
  vnWeekToDate,
} from "@/lib/dates";
import { vnd } from "@/lib/stats";
import { getMonthlyPayroll, getPayoutHistory, PAYROLL_EPOCH, type DueRow } from "@/lib/payroll";
import { NATIVE_PICKER } from "@/components/cabinet/fieldClasses";
import { PageHeader } from "@/components/cabinet/PageHeader";
import { StaffAvatar } from "@/components/cabinet/StaffAvatar";
import { Hint } from "@/components/cabinet/Hint";
import { PayoutForm } from "./PayoutForm";
import { HistoryRow } from "./HistoryRow";
import { CHIP, StatLabel } from "./parts";

export const metadata: Metadata = { title: "Админка · Выплата зарплаты" };

// Выплата зарплаты (переделана 15.11.2026 под начальника: David передаёт ему
// проект). Сверху итог «к выплате», под ним плашки-профили: аватарка, имя и
// одна цифра. Всё подробное (как посчитали, недели, выплаты) открывается по
// нажатию на плашку, в профиле (/admin/payroll/<id>). Пояснения убраны в «?».
//
// Раньше в каждой строке было две цифры («за период» и «осталось выдать») и
// переключатель периода над ними: начальник путался, какая цифра к чему.
// Период остался только для выгрузки в Excel внизу.

const ROLE: Record<DueRow["kind"], string> = {
  instructor: "инструктор",
  smm: "СММ",
  mechanic: "механик",
  agent: "агент",
};

function roleLine(row: DueRow): string {
  const role = row.kind === "mechanic" && row.left === null ? "штат" : ROLE[row.kind];
  return [role, row.employmentLabel].filter(Boolean).join(" · ");
}

// Цифра справа на плашке: сколько выдать сейчас. Ноль и переплата — словами,
// а не «0 ₫», чтобы глаз сразу видел, что тут всё в порядке.
function DueValue({ row }: { row: DueRow }) {
  if (row.due === null) {
    return (
      <>
        <StatLabel>выдано</StatLabel>
        <p className="text-lg font-bold tabular-nums text-muted">{vnd(row.paidToDate)}</p>
      </>
    );
  }
  const due = Math.round(row.due);
  if (due > 0) {
    return (
      <>
        <StatLabel>к выплате</StatLabel>
        <p className="text-lg font-bold tabular-nums text-primary sm:text-xl">{vnd(due)}</p>
      </>
    );
  }
  if (due < 0) {
    return <span className={`${CHIP} bg-amber-100 text-amber-800`}>Переплата</span>;
  }
  return <span className={`${CHIP} bg-emerald-100 text-emerald-800`}>✓ Всё выдано</span>;
}

function Plaque({ row }: { row: DueRow }) {
  const href =
    row.payee?.kind === "staff" ? `/admin/payroll/${row.payee.id}` : "/admin/agents";
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 transition-colors hover:border-primary sm:p-4 ${
        row.fired ? "opacity-80" : ""
      }`}
    >
      <StaffAvatar name={row.name} photoUrl={row.photoUrl} dim={row.fired} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold">{row.name}</p>
        <p className="truncate text-xs text-muted">{roleLine(row)}</p>
        {row.thisWeek && Math.round(row.thisWeek.earned) > 0 && (
          <p className="mt-0.5 text-xs text-muted">
            эта неделя{" "}
            <span className="font-semibold tabular-nums text-ink">
              {vnd(row.thisWeek.earned)}
            </span>
          </p>
        )}
        {row.upcoming && (row.due ?? 0) > 0 && (
          <p className="mt-0.5 text-xs text-muted">оклад за {row.upcoming.label}</p>
        )}
      </div>
      <div className="shrink-0 text-right">
        <DueValue row={row} />
      </div>
      <span aria-hidden className="shrink-0 text-lg text-muted">
        ›
      </span>
    </Link>
  );
}

const presetClass =
  "rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-primary hover:text-primary";

export default async function AdminPayrollPage() {
  const week = vnWeekToDate();
  const prevWeek = vnPrevWeek();
  const curMonth = vnCurrentMonth();
  const monthLast = vnShiftDays(curMonth.toDay, -1);
  const prevMonth = vnPrevMonth();
  const today = vnToday();
  const epochLabel = dayShort(PAYROLL_EPOCH);

  const supabase = await createClient();
  const [payroll, history] = await Promise.all([
    getMonthlyPayroll(supabase, week),
    getPayoutHistory(supabase),
  ]);

  const staffRows = payroll.rows.filter((r) => r.kind !== "agent");
  const agentRows = payroll.rows.filter((r) => r.kind === "agent");
  const months = [...new Set(history.map((p) => p.paidOn.slice(0, 7)))];
  const xlsx = (from: string, to: string) =>
    `/api/admin/payroll?from=${from}&to=${to}&format=xlsx`;

  return (
    <div>
      <PageHeader title="Выплата зарплаты" hint="Нажмите на человека, чтобы открыть его профиль" />

      {/* 1. Итог. */}
      <section className="mt-4 flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-primary/30 bg-surface p-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold">
            К выплате всего
            <Hint title="К выплате">
              <p>
                Сколько школа должна выдать сотрудникам прямо сейчас: всё, что
                они заработали с {epochLabel}, минус всё, что им уже выдали.
              </p>
              <p>
                Инструкторам сюда не входит идущая неделя (суббота-пятница): за
                неё платят в субботу. Оклад механика за текущий месяц входит в
                итог после конца месяца.
              </p>
            </Hint>
          </h2>
          <p className="text-sm text-muted">на сегодня</p>
        </div>
        <p className="text-3xl font-bold tabular-nums text-primary">{vnd(payroll.dueTotal)}</p>
      </section>

      {/* 2. Плашки-профили. */}
      <section className="mt-6">
        <h2 className="font-bold">Сотрудники</h2>
        <div className="mt-2 grid gap-2 lg:grid-cols-2">
          {staffRows.map((row) => (
            <Plaque key={row.key} row={row} />
          ))}
        </div>
        {staffRows.length === 0 && (
          <p className="mt-2 text-sm text-muted">Сотрудников с начислениями пока нет.</p>
        )}
      </section>

      {agentRows.length > 0 && (
        <section className="mt-6">
          <h2 className="font-bold">Агенты</h2>
          <div className="mt-2 grid gap-2 lg:grid-cols-2">
            {agentRows.map((row) => (
              <Plaque key={row.key} row={row} />
            ))}
          </div>
        </section>
      )}

      {/* 3. Свободная выплата: аванс, доплата, агенту. Выплата по неделе
          удобнее из профиля: там кнопка сама подставляет сумму. */}
      <section className="mt-6 rounded-2xl border border-line bg-surface p-4">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          Выплатить
          <Hint title="Выплата">
            <p>
              Кому, сколько и какого числа выдали деньги. Это и есть расход
              школы: в «Расходы» зарплату вносить не нужно, иначе она спишется
              дважды.
            </p>
            <p>
              Выплату за неделю удобнее делать из профиля человека: там кнопка
              сама подставит сумму.
            </p>
          </Hint>
        </h2>
        <PayoutForm payees={payroll.payees} today={today} />
      </section>

      {/* 4. История. */}
      <section className="mt-3 rounded-2xl border border-line bg-surface p-4">
        <h2 className="font-bold">История выплат</h2>
        {months.length === 0 && <p className="mt-2 text-sm text-muted">Выплат пока не было.</p>}
        {/* Открыт только свежий месяц: вся история с августа на телефоне
            занимала четыре экрана. Прошлые месяцы раскрываются по нажатию. */}
        {months.map((ym, i) => {
          const rows = history.filter((p) => p.paidOn.slice(0, 7) === ym);
          const total = rows.reduce((s, p) => s + p.amount, 0);
          return (
            <details key={ym} open={i === 0} className="group mt-3">
              <summary className="flex cursor-pointer list-none items-baseline justify-between gap-3 border-b border-line pb-1 [&::-webkit-details-marker]:hidden">
                <span className="text-sm font-semibold text-muted first-letter:uppercase">
                  {monthLabel(`${ym}-01`)}{" "}
                  <span className="inline-block transition-transform group-open:rotate-180">▾</span>
                </span>
                <span className="text-sm font-bold tabular-nums">{vnd(total)}</span>
              </summary>
              <div>
                {rows.map((p) => (
                  <HistoryRow key={`${p.kind}-${p.id}`} p={p} />
                ))}
              </div>
            </details>
          );
        })}
      </section>

      {/* 5. Excel за любой период. */}
      <section className="mt-3 rounded-2xl border border-line bg-surface p-4">
        <h2 className="font-bold">Скачать в Excel</h2>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <a href={xlsx(week.fromDay, week.lastDay)} download className={presetClass}>
            Эта неделя
          </a>
          <a href={xlsx(prevWeek.fromDay, prevWeek.lastDay)} download className={presetClass}>
            Прошлая неделя
          </a>
          <a href={xlsx(curMonth.fromDay, monthLast)} download className={presetClass}>
            Этот месяц
          </a>
          <a href={xlsx(prevMonth.fromDay, prevMonth.lastDay)} download className={presetClass}>
            Прошлый месяц
          </a>
        </div>
        <form action="/api/admin/payroll" method="get" className="mt-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="format" value="xlsx" />
          <label className="flex flex-col items-start text-xs text-muted">
            С
            <input
              type="date"
              name="from"
              defaultValue={week.fromDay}
              max={today}
              required
              className={`mt-1 ${NATIVE_PICKER} rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary`}
            />
          </label>
          <label className="flex flex-col items-start text-xs text-muted">
            По
            <input
              type="date"
              name="to"
              defaultValue={today}
              max={today}
              required
              className={`mt-1 ${NATIVE_PICKER} rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary`}
            />
          </label>
          <button
            type="submit"
            className="rounded-xl border border-primary px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
          >
            Скачать
          </button>
        </form>
      </section>
    </div>
  );
}
