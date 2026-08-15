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
// спрятаны под «Как посчитали», а правила — в свёрнутом «Как это работает».
//
// 15.08.2026, после показа вкладки начальнику. Слова «долг» на экране больше
// нет — сумма называется «осталось выдать». И мелкий серый текст с экрана убран
// в раскрывашки: цифр было столько, что глазу не за что было зацепиться.
// Правило простое — на экране только крупное и подписанное, всё остальное под
// «Как посчитали», и внутри неё нормальным кеглем, а не 11 пикселями.

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

// Подпись над крупной цифрой. Капсом и с разрядкой намеренно: цифр в строке
// две, они про разное, и подпись должна прочитаться раньше самого числа —
// иначе рядом стоят два похожих числа и непонятно, какое из них к чему.
function StatLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-muted">
      {children}
    </p>
  );
}

const CHIP = "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold";

// Строка в раскрывашке «Как посчитали»: подпись слева, число справа колонкой.
// Кегль здесь обычный (text-sm у родителя), а не 11 пикселей, как было: под
// раскрывашку лезут именно затем, чтобы прочитать, а не «увидеть, что текст
// есть». Итоговые строки отделяются чертой и жирным — глаз сразу цепляет,
// откуда взялась крупная цифра наверху.
function DetailLine({
  label,
  hint,
  value,
  strong = false,
  negative = false,
}: {
  label: string;
  hint?: string;
  value: number;
  strong?: boolean;
  negative?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 py-1 ${
        strong ? "mt-1 border-t border-line pt-2 font-bold" : "text-muted"
      }`}
    >
      <span className="min-w-0">
        {label}
        {hint ? <span className="text-muted"> · {hint}</span> : null}
      </span>
      <span className="shrink-0 tabular-nums">
        {negative ? "− " : ""}
        {vnd(value)}
      </span>
    </div>
  );
}

// Карточка человека. На экране остаётся только то, ради чего сюда зашли: имя,
// две крупные цифры с подписями и кнопка. Цифры две, потому что отвечают на
// разные вопросы: «заработал за выбранные дни» — это то, что начальник выдаёт в
// конце недели (её же подставляет кнопка), «осталось выдать» — страховка от
// недоплаты и переплаты (не зависит от того, как нарезан период, см.
// lib/payroll).
//
// Всё остальное (выплачено за период, начислено и выдано с точки отсчёта, из
// чего сложилось начисление) уехало под «Как посчитали». Раньше это была строка
// 11-м кеглем с четырьмя числами прямо под цифрами: на четверых инструкторов —
// три десятка чисел на экране, и начальник не понимал, куда смотреть (правка
// после показа вкладки живьём, 15.08.2026).
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
  const over = row.left !== null && row.left < 0;

  return (
    <div className="rounded-2xl border border-line bg-bg/70 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 font-bold">{row.name}</p>
        <span className="rounded-full bg-line/50 px-2 py-0.5 text-xs font-semibold text-muted">
          {KIND_LABEL[row.kind]}
          {row.employmentLabel ? ` · ${row.employmentLabel}` : ""}
        </span>
        {over && (
          <span className={`${CHIP} bg-amber-100 text-amber-800`}>
            Переплата {vnd(-row.left!)}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-x-8 gap-y-3">
        {/* Заработок за выбранные дни — то, ради чего выбирают период. */}
        <div>
          <StatLabel>за {periodLabel}</StatLabel>
          <p className="mt-0.5 text-xl font-bold tabular-nums sm:text-2xl">
            {vnd(row.accrued)}
          </p>
        </div>

        {/* Сколько школа ещё не отдала. От периода не зависит. */}
        <div>
          <StatLabel>
            {row.left !== null
              ? "осталось выдать"
              : row.payee
                ? "выдано всего"
                : "начислено"}
          </StatLabel>
          {row.left !== null ? (
            settled && !over ? (
              <p className="mt-1">
                <span className={`${CHIP} bg-emerald-100 text-emerald-800`}>
                  ✓ Всё выдано
                </span>
              </p>
            ) : (
              <p
                className={`mt-0.5 text-xl font-bold tabular-nums sm:text-2xl ${
                  over ? "text-muted" : "text-primary"
                }`}
              >
                {over ? vnd(0) : vnd(row.left)}
              </p>
            )
          ) : (
            <p className="mt-0.5 text-xl font-bold tabular-nums text-muted sm:text-2xl">
              {vnd(row.payee ? row.paidToDate : row.accrued)}
            </p>
          )}
        </div>

        {row.payee && row.accrued > 0 && (
          <div className="w-full sm:ml-auto sm:w-auto">
            <PayButton
              payee={`${row.payee.kind}:${row.payee.id}`}
              amount={row.accrued}
              warn={settled || row.paid >= row.accrued}
            />
          </div>
        )}
      </div>

      <details className="group mt-3">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-primary hover:text-primary [&::-webkit-details-marker]:hidden">
          Как посчитали
          <span className="transition-transform group-open:rotate-180">▾</span>
        </summary>

        <div className="mt-2 rounded-xl border border-line bg-surface p-3 text-sm">
          {row.details.length > 0 && (
            <div>
              <StatLabel>за {periodLabel}</StatLabel>
              <div className="mt-1">
                {row.details.map((d) => (
                  <DetailLine
                    key={d.label}
                    label={d.label}
                    hint={d.hint}
                    value={d.value}
                  />
                ))}
                <DetailLine label="Начислено" value={row.accrued} strong />
                {row.payee && (
                  <DetailLine label="Выплачено в эти дни" value={row.paid} />
                )}
              </div>
            </div>
          )}

          {row.left !== null && (
            <div className={row.details.length > 0 ? "mt-4" : ""}>
              <StatLabel>откуда «осталось выдать»</StatLabel>
              <div className="mt-1">
                <DetailLine
                  label={`Начислено с ${epochLabel}`}
                  value={row.accruedToDate}
                />
                <DetailLine
                  label={`Выдано с ${epochLabel}`}
                  value={row.paidToDate}
                  negative
                />
                <DetailLine
                  label={row.left < 0 ? "Выдано лишнего" : "Осталось выдать"}
                  value={Math.abs(row.left)}
                  strong
                />
              </div>
            </div>
          )}

          {row.left === null && (
            <p className={`text-muted ${row.details.length > 0 ? "mt-4" : ""}`}>
              {row.payee
                ? `Ставки в системе нет: сколько платить — решает начальник. С ${epochLabel} выдано ${vnd(row.paidToDate)}.`
                : "Справка: эти деньги школа никому не выдаёт."}
            </p>
          )}
        </div>
      </details>
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
          <span className="ml-2 text-xs font-normal text-muted">
            {dayLabel(p.paidOn)}
          </span>
        </p>
        {(p.comment || p.period) && (
          <p className="truncate text-sm text-muted">
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
            className="text-xs font-semibold text-muted transition-colors hover:text-red-600"
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
      <PageHeader
        title="Выплата зарплаты"
        hint="Кому сколько выдать и что уже выдали"
      />
      {/* Пояснение разбито на три подписанных куска: сплошные абзацы отсюда
          читали по диагонали и всё равно спрашивали «а это что за цифра». */}
      <PageNote>
        <p className="font-semibold text-ink">Две цифры в строке человека</p>
        <p>
          <b>За …</b> — сколько человек заработал за выбранные сверху дни: её и
          выдают в конце недели, кнопка «Выплатить» подставляет в форму именно
          её. <b>Осталось выдать</b> — всё начисленное с {epochLabel} минус всё
          выданное с {epochLabel}. Эта цифра от периода не зависит, поэтому не
          меняется от того, как нарезать календарь, и показывает недоплату или
          переплату. Красная кнопка «Выплатить» значит, что за этот период уже
          отдали, — второй раз платить не нужно.
        </p>

        <p className="pt-2 font-semibold text-ink">Как считается начисление</p>
        <p>
          <b>Инструктор:</b> доля 15% с занятий дня + 200 000 ₫ за каждый выход
          по регламенту (открыл до 9:00, закрыл после 18:00) + доля котла
          абонементов.
        </p>
        <p>
          <b>СММщик и разработчик:</b> фикс за каждую полную неделю с{" "}
          {epochLabel} плюс 1% с выручки — он закрывается по итогам месяца и
          попадает в «осталось выдать» только за уже прошедшие месяцы.
        </p>
        <p>
          <b>Агент:</b> награды за клиентов, дошедших до услуги.
        </p>

        <p className="pt-2 font-semibold text-ink">
          Выплата отсюда — это и есть расход
        </p>
        <p>
          Она уменьшает «деньги на руках» в день выдачи. В «Расходы» зарплату
          вносить не нужно, иначе одни и те же деньги спишутся дважды.
        </p>
      </PageNote>

      {/* 1. Чем платим — самый верх: это то, ради чего вкладку открывают. */}
      <section className="mt-4 rounded-2xl border border-primary/30 bg-surface p-4 shadow-[0_1px_3px_rgba(15,34,51,0.04)]">
        <h2 className="text-lg font-bold">Выплатить</h2>
        <PayoutForm payees={payroll.payees} today={vnToday()} />
      </section>

      {/* 2. Период. Раньше четыре кнопки висели без единого слова, и начальник
          не понимал, на что они влияют, — теперь это подписано прямо тут. */}
      <div className="mt-6">
        <h2 className="font-bold">Период</h2>
        <p className="mt-0.5 text-sm text-muted">
          Влияет только на левую цифру «за …» в списке ниже. «Осталось выдать»
          считается с {epochLabel} и от периода не зависит.
        </p>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
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
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Осталось выдать</h2>
            <p className="text-sm text-muted">всего по школе на сегодня</p>
          </div>
          <p className="text-3xl font-bold text-primary tabular-nums">
            {vnd(payroll.leftTotal)}
          </p>
        </div>

        {/* Четыре справочных числа были двумя строками мелкого серого прямо под
            итогом и спорили с ним за внимание. Теперь — под тем же «Как
            посчитали», что и в карточках. */}
        <details className="group mt-3">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-primary hover:text-primary [&::-webkit-details-marker]:hidden">
            Как посчитали
            <span className="transition-transform group-open:rotate-180">▾</span>
          </summary>
          <div className="mt-2 rounded-xl border border-line bg-bg/70 p-3 text-sm">
            <StatLabel>с {epochLabel} по сегодня</StatLabel>
            <div className="mt-1">
              <DetailLine
                label="Начислено всем"
                value={payroll.accruedToDateTotal}
              />
              <DetailLine
                label="Выдано всем"
                value={payroll.paidToDateTotal}
                negative
              />
              <DetailLine
                label="Осталось выдать"
                value={payroll.leftTotal}
                strong
              />
            </div>
            {payroll.accruedToDateTotal - payroll.paidToDateTotal !==
              payroll.leftTotal && (
              <p className="mt-1 text-xs text-muted">
                Итог больше разницы: кому-то выдали лишнего, но переплата одному
                не гасит то, что не выдано другому.
              </p>
            )}

            <div className="mt-4">
              <StatLabel>за {label} · справка</StatLabel>
              <div className="mt-1">
                <DetailLine label="Начислено" value={payroll.accruedTotal} />
                <DetailLine label="Выплачено" value={payroll.paidTotal} />
              </div>
            </div>
          </div>
        </details>

        <div className="mt-3 space-y-2">
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
              Выдавать нечего: с {epochLabel} никому ничего не начислено.
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
