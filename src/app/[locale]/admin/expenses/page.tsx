import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { vnMonth, vnToday } from "@/lib/dates";
import { vnd } from "@/lib/stats";
import { getFinance } from "@/lib/finance";
import { MonthSwitcher, resolveYm } from "../MonthSwitcher";
import { ConfirmSubmit } from "../ConfirmSubmit";
import { deleteExpenseAction, addExpenseAction } from "../actions";
import { getActiveDict, getFullDict } from "@/lib/dictionaries";
import { ExpenseFields } from "@/components/cabinet/ExpenseFields";
import { DictionaryManager } from "../settings/DictionaryManager";
import { PageHeader } from "@/components/cabinet/PageHeader";
import { PageNote } from "@/components/cabinet/PageNote";

export const metadata: Metadata = { title: "Админка · Расходы" };

// Вкладка «Расходы» (пак E) — мини-P&L школы за месяц. Основные расходы
// считаются из выручки на лету (Marina 35%, ЗП инструкторов, Дэвид+Ромчик 2%),
// дополнительные — ручные из таблицы expenses. Итог — чистая прибыль, то есть
// деньги босса: со своих сессий он платит только Marina и 2% CRM (см. lib/finance).

function Row({
  label,
  hint,
  value,
}: {
  label: string;
  hint?: string;
  value: string;
}) {
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span className="min-w-0 truncate text-muted">
        {label}
        {hint && <span className="text-xs"> · {hint}</span>}
      </span>
      <span className="min-w-4 flex-1 border-b border-dotted border-line" />
      <span className="shrink-0 font-semibold">{value}</span>
    </div>
  );
}

export default async function AdminExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const { m } = await searchParams;
  const ym = resolveYm(m);
  const month = vnMonth(ym);

  const supabase = await createClient();
  const [fin, categories, allCategories] = await Promise.all([
    getFinance(supabase, month),
    getActiveDict(supabase, "expense_categories"), // активные — для выпадашки
    getFullDict(supabase, "expense_categories"), // все (в т.ч. скрытые) — для управления
  ]);

  return (
    <div>
      <PageHeader
        title="Расходы"
        hint="Куда уходят деньги за месяц"
      />
      <PageNote>Основные расходы (Marina, ЗП, СММ) считаются из выручки сами. Дополнительные — бензин, ремонт, реклама — вносите руками. Выручка месяца — по дате оплаты, ЗП инструкторов — по дате занятия: если гость заплатил в другом месяце, эти две цифры расходятся намеренно.</PageNote>

      <MonthSwitcher ym={ym} basePath="/admin/expenses" />

      {/* Итог наверху — чистая прибыль школы за месяц */}
      <div className="mt-3 rounded-2xl border border-line bg-surface p-4">
        <p className="text-xs text-muted">Чистая прибыль за {month.label}</p>
        <p className="mt-1 text-3xl font-bold text-primary">
          {vnd(fin.netProfit)}
        </p>
        <p className="mt-1 text-xs text-muted">
          Выручка {vnd(fin.revenue)} − расходы{" "}
          {vnd(fin.autoTotal + fin.manualTotal)}
        </p>
      </div>

      {/* Выручка */}
      <section className="mt-3 rounded-2xl border border-line bg-surface p-4">
        <h2 className="font-bold">Выручка</h2>
        <div className="mt-3 space-y-1">
          <Row label="Сессии" value={vnd(fin.sessionsRevenue)} />
          <Row label="Оплаченные абонементы" value={vnd(fin.paidSubsRevenue)} />
          <div className="mt-2 flex items-baseline justify-between gap-2 border-t border-line pt-2">
            <span className="font-semibold">Итого выручка</span>
            <span className="font-bold text-primary">{vnd(fin.revenue)}</span>
          </div>
        </div>
      </section>

      {/* Основные расходы (авто) */}
      <section className="mt-3 rounded-2xl border border-line bg-surface p-4">
        <h2 className="font-bold">Основные расходы</h2>
        <p className="mt-1 text-xs text-muted">Считаются из выручки автоматически.</p>
        <div className="mt-3 space-y-1">
          <Row label="Marina Beach" hint="35% выручки" value={vnd(fin.marina)} />
          {/* ЗП тут НАЧИСЛЕННАЯ: в расчёт она уходит в момент записи занятия.
              Деньги на руки отдают раз в неделю, поэтому вторая строка отвечает
              на живой вопрос «а сколько я уже роздал» — отметки ставятся на
              «Расчёте выплат». На прибыль они не влияют. */}
          <Row
            label="ЗП инструкторов"
            hint={`15% их сессий (−комиссия агента) + ${fin.instructorShifts} зачтённых выходов${
              fin.instructorShiftsUnpaid > 0
                ? ` (не зачтено ${fin.instructorShiftsUnpaid})`
                : ""
            } + 15% их абонементов`}
            value={vnd(fin.instructorPay)}
          />
          {fin.instructorPaidOut > 0 && (
            <Row
              label="— из них выдано на руки"
              hint={
                fin.instructorPay - fin.instructorPaidOut > 0.5
                  ? `ещё должны ${vnd(fin.instructorPay - fin.instructorPaidOut)}`
                  : "выплачено полностью"
              }
              value={vnd(fin.instructorPaidOut)}
            />
          )}
          {fin.agentCommissions > 0 && (
            <Row
              label="Комиссии агентов"
              hint="фикс за приведённых клиентов"
              value={vnd(fin.agentCommissions)}
            />
          )}
          <Row
            label="Дэвид + Ромчик (СММ)"
            hint={`2% · по ${vnd(fin.crmEach)} каждому`}
            value={vnd(fin.crmCut)}
          />
          <div className="mt-2 flex items-baseline justify-between gap-2 border-t border-line pt-2">
            <span className="font-semibold">Итого основные</span>
            <span className="font-bold">{vnd(fin.autoTotal)}</span>
          </div>
        </div>
      </section>

      {/* Дополнительные расходы (ручные) */}
      <section className="mt-3 rounded-2xl border border-line bg-surface p-4">
        <h2 className="font-bold">Дополнительные расходы</h2>
        {fin.manualExpenses.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            За этот месяц ручных расходов нет.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {fin.manualExpenses.map((e) => (
              <div
                key={e.id}
                className="flex items-baseline justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {e.category ?? "Без категории"}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {e.date}
                    {e.author && ` · внёс: ${e.author}`}
                    {e.comment && ` · ${e.comment}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-baseline gap-3">
                  <span className="font-semibold">{vnd(e.amount)}</span>
                  <form action={deleteExpenseAction}>
                    <input type="hidden" name="id" value={e.id} />
                    <ConfirmSubmit
                      message={`Удалить расход «${e.category ?? "без категории"}» на ${vnd(e.amount)}?`}
                      className="text-xs font-semibold text-muted transition-colors hover:text-red-500"
                    >
                      Удалить
                    </ConfirmSubmit>
                  </form>
                </div>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-2 border-t border-line pt-2">
              <span className="font-semibold">Итого дополнительные</span>
              <span className="font-bold">{vnd(fin.manualTotal)}</span>
            </div>
          </div>
        )}

        <div className="mt-4 border-t border-line pt-4">
          <h3 className="text-sm font-bold">Добавить расход</h3>
          <div className="mt-3">
            <ExpenseFields
              action={addExpenseAction}
              today={vnToday()}
              categories={categories}
            />
          </div>
        </div>
      </section>

      {/* Категории расходов — управление рядом с самими расходами (пак 3). Из
          этого списка выбирают категорию и админ, и инструкторы. */}
      <div className="mt-3">
        <DictionaryManager
          table="expense_categories"
          title="Категории расходов"
          hint="Из этого списка выбираете категорию вы и инструкторы при внесении расхода."
          placeholder="Топливо"
          items={allCategories}
        />
      </div>
    </div>
  );
}
