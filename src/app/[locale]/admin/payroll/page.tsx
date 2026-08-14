import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  vnCurrentMonth,
  vnMonth,
  vnPeriod,
  vnPrevMonth,
  vnPrevWeek,
  vnRangeLabel,
  vnShiftDays,
  vnToday,
  vnWeekOf,
} from "@/lib/dates";
import { vnd } from "@/lib/stats";
import {
  getMonthlyPayroll,
  getPayoutHistory,
  PAYROLL_EPOCH,
  type DueRow,
  type PayoutRow,
} from "@/lib/payroll";
import { NATIVE_PICKER } from "@/components/cabinet/fieldClasses";
import { PayoutForm } from "./PayoutForm";
import { PayButton } from "./PayButton";
import { deleteSalaryPayoutAction } from "../actions";
import { ConfirmSubmit } from "../ConfirmSubmit";
import { PageHeader } from "@/components/cabinet/PageHeader";
import { PageNote } from "@/components/cabinet/PageNote";

export const metadata: Metadata = { title: "Админка · Выплата зарплаты" };

// Выплата зарплаты. Три блока сверху вниз, ровно в том порядке, в каком с
// вкладкой работают: чем платим → кому сколько осталось → что уже отдали.
//
// Раньше это был «Расчёт выплат»: длинные пояснения, у каждого человека четыре
// строки подробностей и кнопка «отметить выплачено за период». Считать он
// считал, а отдать деньги было нечем — сумма и дата выдачи в систему не
// вводились. Теперь наоборот: форма выплаты стоит первой, подробности расчёта
// спрятаны под «подробнее», а правила — в свёрнутом «Как это работает».

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

const presetClass = (active: boolean) =>
  `rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
    active
      ? "bg-primary text-white"
      : "border border-line text-muted hover:border-primary hover:text-primary"
  }`;

const KIND_LABEL: Record<DueRow["kind"], string> = {
  instructor: "инструктор",
  smm: "СММ",
  dev: "разработчик",
  mechanic: "штат",
  agent: "агент",
  crm: "справка",
};

function monthLabel(day: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
}

function dayLabel(day: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
}

// Строка долга. Крупным — то, ради чего сюда зашли: имя и сколько осталось
// отдать. Цифры две и обе крупные, потому что отвечают на разные вопросы:
// «заработал за выбранные дни» — это то, что начальник выдаёт в конце недели,
// «долг с точки отсчёта» — страховка от недоплаты и переплаты (он не зависит от
// того, как нарезан период, см. lib/payroll). Рядом кнопка, которая заполняет
// форму наверху суммой за период; если за этот период уже отдали столько же или
// долга нет вовсе — кнопка красная (платить второй раз не надо). Из чего
// сложилось начисление — под «подробнее», иначе на четверых инструкторов это
// полтора экрана текста.
function DueCard({
  row,
  epochLabel,
  periodLabel,
}: {
  row: DueRow;
  epochLabel: string;
  periodLabel: string;
}) {
  const settled = row.left !== null && row.left <= 0;
  return (
    <div className="border-b border-line/70 py-3 last:border-0 last:pb-0">
      <p className="min-w-0 font-semibold">
        {row.name}
        <span className="ml-2 text-[11px] font-normal text-muted">
          {KIND_LABEL[row.kind]}
          {row.employmentLabel ? ` · ${row.employmentLabel}` : ""}
        </span>
      </p>

      <div className="mt-1 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="flex gap-6">
          {/* Заработок за выбранные дни — то, ради чего выбирают период. */}
          <div>
            <p className="text-[11px] text-muted">за {periodLabel}</p>
            <p className="text-lg font-bold tabular-nums">{vnd(row.accrued)}</p>
          </div>
          {/* Долг: от периода не зависит. */}
          <div>
            <p className="text-[11px] text-muted">
              {row.left !== null ? `долг с ${epochLabel}` : "выдано всего"}
            </p>
            {row.left !== null ? (
              <p
                className={`text-lg font-bold tabular-nums ${
                  settled ? "text-muted" : "text-primary"
                }`}
              >
                {settled ? "выплачено" : vnd(row.left)}
              </p>
            ) : (
              <p className="text-lg font-bold tabular-nums text-muted">
                {vnd(row.payee ? row.paidToDate : row.accrued)}
              </p>
            )}
          </div>
        </div>

        {row.payee && row.accrued > 0 && (
          <div className="ml-auto">
            <PayButton
              payee={`${row.payee.kind}:${row.payee.id}`}
              amount={row.accrued}
              warn={settled || row.paid >= row.accrued}
            />
          </div>
        )}
      </div>

      {row.left !== null ? (
        <p className="mt-1 text-xs text-muted">
          выплачено за период {vnd(row.paid)} · с {epochLabel} начислено{" "}
          {vnd(row.accruedToDate)}, выдано {vnd(row.paidToDate)}
          {row.left < 0 ? ` · переплата ${vnd(-row.left)}` : ""}
        </p>
      ) : (
        <p className="mt-1 text-xs text-muted">
          {row.payee
            ? `ставки в системе нет · выдано с ${epochLabel} ${vnd(row.paidToDate)}`
            : "справка · школа эти деньги никому не выдаёт"}
        </p>
      )}

      {row.details.length > 0 && (
        <details className="mt-1">
          <summary className="cursor-pointer list-none text-[11px] font-semibold text-muted transition-colors hover:text-primary [&::-webkit-details-marker]:hidden">
            подробнее ▾
          </summary>
          <div className="mt-1 space-y-0.5">
            {row.details.map((d) => (
              <div
                key={d.label}
                className="flex items-baseline justify-between gap-2 text-xs text-muted"
              >
                <span className="min-w-0">
                  {d.label}
                  {d.hint ? ` · ${d.hint}` : ""}
                </span>
                <span className="shrink-0 tabular-nums">{vnd(d.value)}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

// Одна выплата в истории. Кнопка удаления — на случай «ткнул не туда»:
// правки суммы нет намеренно, удалить и внести заново честнее.
function HistoryRow({ p }: { p: PayoutRow }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/70 py-2 last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-semibold">
          {p.name}
          <span className="ml-2 text-[11px] font-normal text-muted">
            {dayLabel(p.paidOn)}
          </span>
        </p>
        {(p.comment || p.period) && (
          <p className="truncate text-xs text-muted">
            {p.period
              ? `за ${dayLabel(p.period.from)} — ${dayLabel(p.period.to)}`
              : ""}
            {p.period && p.comment ? " · " : ""}
            {p.comment ?? ""}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-baseline gap-3">
        <p className="font-bold tabular-nums">{vnd(p.amount)}</p>
        <form action={deleteSalaryPayoutAction}>
          <input type="hidden" name="id" value={p.id} />
          <input type="hidden" name="kind" value={p.kind} />
          <ConfirmSubmit
            message={`Удалить выплату ${vnd(p.amount)} (${p.name})?`}
            className="text-[11px] font-semibold text-muted transition-colors hover:text-red-600"
          >
            удалить
          </ConfirmSubmit>
        </form>
      </div>
    </div>
  );
}

export default async function AdminPayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; m?: string }>;
}) {
  const { from, to, m } = await searchParams;

  const week = vnWeekOf(); // текущая неделя, пн–вс
  const prevWeek = vnPrevWeek();
  const curMonth = vnCurrentMonth();
  const monthLast = vnShiftDays(curMonth.toDay, -1);
  const prevMonth = vnPrevMonth();

  const custom = Boolean(from && to && DAY_RE.test(from) && DAY_RE.test(to) && from <= to);
  // Старые ссылки вида ?m=2026-07 должны продолжать открываться — теперь как
  // обычный период «месяц целиком».
  const legacy = !custom && /^\d{4}-\d{2}$/.test(m ?? "") ? vnMonth(m!) : null;

  const fromDay = custom ? from! : (legacy?.fromDay ?? week.fromDay);
  const lastDay = custom
    ? to!
    : legacy
      ? vnShiftDays(legacy.toDay, -1)
      : week.lastDay;

  const range = vnPeriod(fromDay, lastDay);
  const label = vnRangeLabel(fromDay, lastDay);
  const epochLabel = dayLabel(PAYROLL_EPOCH); // «1 авг.» — подпись накопительных цифр
  // Короткая подпись периода: она стоит над цифрой в каждой карточке, полная
  // («1 — 7 августа 2026 г.») туда не влезает на телефоне.
  const periodLabel =
    fromDay === lastDay
      ? dayLabel(fromDay)
      : `${dayLabel(fromDay)} — ${dayLabel(lastDay)}`;
  const periodQs = `from=${fromDay}&to=${lastDay}`;
  const isPreset = (f: string, l: string) => fromDay === f && lastDay === l;

  const supabase = await createClient();
  const [payroll, history] = await Promise.all([
    getMonthlyPayroll(supabase, range),
    getPayoutHistory(supabase),
  ]);

  // История — по месяцам, свежее сверху. Группируем на странице: запрос уже
  // отсортирован, а выплат в школе десятки в год.
  const months = [...new Set(history.map((p) => p.paidOn.slice(0, 7)))];

  return (
    <div>
      <PageHeader title="Выплата зарплаты" hint="Кому должны и что уже отдали" />
      <PageNote>
        <p>
          В каждой строке две цифры. Слева — сколько человек заработал за
          выбранные дни: её и выдают в конце недели, кнопка «Выплатить»
          подставляет в форму именно её. Справа — долг: всё начисленное с{" "}
          {epochLabel} минус всё выданное с {epochLabel}. Долг от выбранного
          периода не зависит, поэтому не меняется от того, как нарезать
          календарь, и показывает недоплату или переплату. Красная кнопка
          «Выплатить» значит, что за этот период уже отдали, — второй раз
          платить не нужно.
        </p>
        <p>
          Инструктору: доля 15% с занятий дня + 200 000 ₫ за каждый выход по
          регламенту (открыл до 9:00, закрыл после 18:00) + доля котла
          абонементов. СММщику и разработчику: фикс за каждую полную неделю с{" "}
          {epochLabel} плюс 1% с выручки — он закрывается по итогам месяца и
          попадает в долг только за уже прошедшие месяцы. Агенту: награды за
          клиентов, дошедших до услуги.
        </p>
        <p>
          Каждая выплата отсюда — это и есть расход школы: она уменьшает «деньги
          на руках» в день выдачи. В «Расходы» зарплату вносить не нужно, иначе
          одни и те же деньги спишутся дважды.
        </p>
      </PageNote>

      {/* 1. Чем платим — самый верх: это то, ради чего вкладку открывают. */}
      <section className="mt-4 rounded-2xl border border-primary/30 bg-surface p-4 shadow-[0_1px_3px_rgba(15,34,51,0.04)]">
        <h2 className="text-lg font-bold">Выплатить</h2>
        <PayoutForm payees={payroll.payees} today={vnToday()} />
      </section>

      {/* 2. Период — маленькой строкой: он влияет только на «начислено». */}
      <div className="mt-6 flex flex-wrap items-center gap-1.5">
        <Link
          href={`/admin/payroll?from=${week.fromDay}&to=${week.lastDay}`}
          className={presetClass(isPreset(week.fromDay, week.lastDay))}
        >
          Эта неделя
        </Link>
        <Link
          href={`/admin/payroll?from=${prevWeek.fromDay}&to=${prevWeek.lastDay}`}
          className={presetClass(isPreset(prevWeek.fromDay, prevWeek.lastDay))}
        >
          Прошлая неделя
        </Link>
        <Link
          href={`/admin/payroll?from=${curMonth.fromDay}&to=${monthLast}`}
          className={presetClass(isPreset(curMonth.fromDay, monthLast))}
        >
          Этот месяц
        </Link>
        <Link
          href={`/admin/payroll?from=${prevMonth.fromDay}&to=${prevMonth.lastDay}`}
          className={presetClass(isPreset(prevMonth.fromDay, prevMonth.lastDay))}
        >
          Прошлый месяц
        </Link>
      </div>

      <form className="mt-2 flex flex-wrap items-end gap-2" action="">
        <label className="flex flex-col items-start text-xs text-muted">
          С
          <input
            type="date"
            name="from"
            defaultValue={fromDay}
            className={`mt-1 ${NATIVE_PICKER} rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary`}
          />
        </label>
        <label className="flex flex-col items-start text-xs text-muted">
          По
          <input
            type="date"
            name="to"
            defaultValue={lastDay}
            className={`mt-1 ${NATIVE_PICKER} rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary`}
          />
        </label>
        <button
          type="submit"
          className="rounded-xl border border-primary px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
        >
          Показать
        </button>
        <a
          href={`/api/admin/payroll?${periodQs}&format=xlsx`}
          download
          className="ml-auto rounded-full border border-line px-4 py-2 text-xs font-semibold text-muted transition-colors hover:border-primary hover:text-primary"
        >
          Excel
        </a>
      </form>

      {/* 3. Кому сколько осталось. */}
      <section className="mt-3 rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-bold">Осталось отдать</h2>
          <p className="text-2xl font-bold text-primary tabular-nums">
            {vnd(payroll.leftTotal)}
          </p>
        </div>
        <p className="mt-0.5 text-xs text-muted">
          долг с {epochLabel} · начислено {vnd(payroll.accruedToDateTotal)} ·
          выплачено {vnd(payroll.paidToDateTotal)}
        </p>
        <p className="text-xs text-muted">
          за {label} (справка) · начислено {vnd(payroll.accruedTotal)} ·
          выплачено {vnd(payroll.paidTotal)}
        </p>

        <div className="mt-2">
          {payroll.rows.map((row) => (
            <DueCard
              key={row.key}
              row={row}
              epochLabel={epochLabel}
              periodLabel={periodLabel}
            />
          ))}
          {payroll.rows.length === 0 && (
            <p className="py-2 text-sm text-muted">
              Долгов нет: с {epochLabel} никому ничего не начислено.
            </p>
          )}
        </div>
      </section>

      {/* 4. Что уже отдали — вся история, свежее сверху. */}
      <section className="mt-3 rounded-2xl border border-line bg-surface p-4">
        <h2 className="font-bold">История выплат</h2>
        {months.length === 0 && (
          <p className="mt-2 text-sm text-muted">Выплат пока не было.</p>
        )}
        {months.map((ym) => {
          const rows = history.filter((p) => p.paidOn.slice(0, 7) === ym);
          const total = rows.reduce((s, p) => s + p.amount, 0);
          return (
            <div key={ym} className="mt-4">
              <div className="flex items-baseline justify-between gap-3 border-b border-line pb-1">
                <h3 className="text-sm font-semibold text-muted first-letter:uppercase">
                  {monthLabel(`${ym}-01`)}
                </h3>
                <p className="text-sm font-bold tabular-nums">{vnd(total)}</p>
              </div>
              {rows.map((p) => (
                <HistoryRow key={`${p.kind}-${p.id}`} p={p} />
              ))}
            </div>
          );
        })}
      </section>
    </div>
  );
}
