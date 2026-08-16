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

// Вкладка «Расходы» — куда ушли деньги школы за месяц и сколько осталось.
//
// С 14.08.2026 экран отвечает на один вопрос: СКОЛЬКО ДЕНЕГ НА РУКАХ. Из
// выручки вычитается доля площадки (35% Marina — эти деньги нашими не были) и
// всё, что физически ушло: выданные зарплаты, выданное агентам, ручные траты.
// Начисленная, но не выданная ЗП стоит ниже справкой и в остаток НЕ лезет —
// иначе экран показывал бы деньги, которых в кассе нет, и наоборот.

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
      <PageNote>Считаем живыми деньгами: из выручки уходит доля Marina (35%) и всё, что вы реально выдали — зарплаты, агентам, траты. Зарплату вносите во вкладке «Выплата зарплаты», сюда — только не-зарплату: аренду, топливо, запчасти, рекламу. Начисленная, но не выданная ЗП стоит справкой внизу и остаток не уменьшает.</PageNote>

      <MonthSwitcher ym={ym} basePath="/admin/expenses" />

      {/* Итог наверху — сколько денег осталось на руках за месяц */}
      <div className="mt-3 rounded-2xl border border-line bg-surface p-4">
        <p className="text-xs text-muted">Деньги на руках за {month.label}</p>
        <p className="mt-1 text-3xl font-bold text-primary">
          {vnd(fin.cashLeft)}
        </p>
        <p className="mt-1 text-xs text-muted">
          Пришло {vnd(fin.revenue)} − ушло {vnd(fin.spent)}
        </p>
      </div>

      {/* Выручка */}
      <section className="mt-3 rounded-2xl border border-line bg-surface p-4">
        <h2 className="font-bold">Пришло</h2>
        <div className="mt-3 space-y-1">
          <Row label="Сессии" value={vnd(fin.sessionsRevenue)} />
          <Row label="Оплаченные абонементы" value={vnd(fin.paidSubsRevenue)} />
          <div className="mt-2 flex items-baseline justify-between gap-2 border-t border-line pt-2">
            <span className="font-semibold">Итого выручка</span>
            <span className="font-bold text-primary">{vnd(fin.revenue)}</span>
          </div>
        </div>
      </section>

      {/* Ушло: доля площадки + всё, что физически выдали */}
      <section className="mt-3 rounded-2xl border border-line bg-surface p-4">
        <h2 className="font-bold">Ушло</h2>
        <p className="mt-1 text-xs text-muted">
          Доля Marina считается из выручки сама, остальное — по факту выдачи.
        </p>
        <div className="mt-3 space-y-1">
          <Row
            label="Marina Beach"
            hint="35% выручки без комиссий агентов"
            value={vnd(fin.marina)}
          />
          <Row
            label="Выдано зарплат"
            hint="вкладка «Выплата зарплаты»"
            value={vnd(fin.paidStaff)}
          />
          {fin.paidAgents > 0 && (
            <Row label="Выдано агентам" value={vnd(fin.paidAgents)} />
          )}
          <Row
            label="Прочие траты"
            hint={`${fin.manualExpenses.length} шт. · список ниже`}
            value={vnd(fin.otherSpent)}
          />
          <div className="mt-2 flex items-baseline justify-between gap-2 border-t border-line pt-2">
            <span className="font-semibold">Итого ушло</span>
            <span className="font-bold">{vnd(fin.spent)}</span>
          </div>
        </div>
      </section>

      {/* Справка: начислено людям, но ещё не выдано. В остаток не входит —
          иначе получилась бы прибыль по начислению, от которой мы ушли. */}
      <section className="mt-3 rounded-2xl border border-line bg-surface p-4">
        <h2 className="font-bold">Начислено, но ещё не выдано</h2>
        <p className="mt-1 text-xs text-muted">
          Справка: эти деньги пока лежат в кассе и в остаток выше входят. Отдадите —
          уйдут из него в тот день.
        </p>
        <div className="mt-3 space-y-1">
          <Row
            label="Инструкторам"
            hint={`начислено ${vnd(fin.instructorPay)} · выдано ${vnd(fin.instructorPaidOut)}`}
            value={vnd(fin.owedInstructors)}
          />
          {fin.agentCommissions > 0 && (
            <Row
              label="Комиссии агентов за период"
              hint="начислено по занятиям"
              value={vnd(fin.agentCommissions)}
            />
          )}
          <Row
            label="Дэвид + Ромчик (СММ)"
            hint={`2% с оборота без комиссий агентов · по ${vnd(fin.crmEach)} каждому`}
            value={vnd(fin.crmCut)}
          />
        </div>
        <p className="mt-3 border-t border-line pt-2 text-xs text-muted">
          Кому сколько осталось отдать поимённо — вкладка «Выплата зарплаты».
          ЗП инструкторов: 15% их сессий (−комиссия агента) + {fin.instructorShifts}{" "}
          зачтённых выходов
          {fin.instructorShiftsUnpaid > 0
            ? ` (не зачтено ${fin.instructorShiftsUnpaid})`
            : ""}{" "}
          + 15% их абонементов. Выручка месяца — по дате оплаты, ЗП — по дате
          занятия: если гость заплатил в другом месяце, цифры расходятся намеренно.
        </p>
      </section>

      {/* Дополнительные расходы (ручные) */}
      <section className="mt-3 rounded-2xl border border-line bg-surface p-4">
        <h2 className="font-bold">Прочие траты</h2>
        <p className="mt-1 text-xs text-muted">
          Аренда, топливо, запчасти, реклама. Зарплату сюда не вносите — она
          учитывается во вкладке «Выплата зарплаты», иначе спишется дважды.
        </p>
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
              <span className="font-semibold">Итого трат</span>
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
