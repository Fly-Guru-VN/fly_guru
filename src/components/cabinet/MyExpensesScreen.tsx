import { createClient } from "@/lib/supabase/server";
import { getAppUser } from "@/lib/auth";
import { vnMonth, vnToday } from "@/lib/dates";
import { vnd } from "@/lib/stats";
import { getActiveDict } from "@/lib/dictionaries";
import { ExpenseFields } from "@/components/cabinet/ExpenseFields";
import { CalMonthNav, resolveCalYm } from "@/components/cabinet/CalMonthNav";
import {
  addInstructorExpenseAction,
  deleteInstructorExpenseAction,
} from "@/app/[locale]/instructor/actions";
import { PageHeader } from "@/components/cabinet/PageHeader";

// «Свои расходы» — экран механика и СММщика (кабинеты /mechanic и /smm): оба
// вносят рабочие траты сами и видят ТОЛЬКО свои (RLS 0016 + 0029 + 0040).
// Экшены — инструкторские, они self-scoped (пишут и удаляют строки того, кто
// нажал). Расходы ШКОЛЫ (Marina, ЗП, реклама) живут в админской вкладке
// «Расходы»: по ним считается чистая прибыль, и это не их дело.

export async function MyExpensesScreen({
  searchParams,
  base,
}: {
  searchParams: Promise<{ m?: string }>;
  /** Кабинет, из которого открыт экран: «/mechanic» или «/smm». */
  base: string;
}) {
  const { m } = await searchParams;
  const ym = resolveCalYm(m);
  const month = vnMonth(ym);

  const user = await getAppUser();
  if (!user) return null; // layout уже средиректил бы; страховка для типов

  const supabase = await createClient();
  const [categories, expensesRes] = await Promise.all([
    getActiveDict(supabase, "expense_categories"),
    supabase
      .from("expenses")
      .select(
        "id, date, amount, comment, category:expense_categories!category_id(name)",
      )
      .eq("created_by", user.id)
      .gte("date", month.fromDay)
      .lt("date", month.toDay)
      .order("date", { ascending: false }),
  ]);

  const rows = (expensesRes.data ?? []).map((e) => ({
    id: e.id as string,
    date: e.date as string,
    amount: Number(e.amount ?? 0),
    comment: (e.comment as string | null) ?? null,
    category: (e.category as unknown as { name: string } | null)?.name ?? null,
  }));
  const total = rows.reduce((s, r) => s + r.amount, 0);

  return (
    <div>
      <PageHeader
        title="Расходы"
        hint="Рабочие траты, которые вы оплатили сами. Видны только свои."
        action={
          <div className="hidden sm:block">
            <CalMonthNav ym={ym} basePath={`${base}/expenses`} className="mt-0" />
          </div>
        }
      />

      <div className="sm:hidden">
        <CalMonthNav ym={ym} basePath={`${base}/expenses`} />
      </div>

      <div className="mt-3 rounded-2xl border border-line bg-surface p-4">
        <p className="text-xs text-muted">Ваши расходы за {month.label}</p>
        <p className="mt-1 text-3xl font-bold text-primary">{vnd(total)}</p>
      </div>

      <section className="mt-3 rounded-2xl border border-line bg-surface p-4">
        <h2 className="font-bold">Список</h2>
        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-muted">За этот месяц расходов нет.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {rows.map((e) => (
              <div key={e.id} className="flex items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {e.category ?? "Без категории"}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {e.date}
                    {e.comment && ` · ${e.comment}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-baseline gap-3">
                  <span className="font-semibold">{vnd(e.amount)}</span>
                  <form action={deleteInstructorExpenseAction}>
                    <input type="hidden" name="id" value={e.id} />
                    <button
                      type="submit"
                      className="text-xs font-semibold text-muted transition-colors hover:text-red-500"
                    >
                      Удалить
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 border-t border-line pt-4">
          <h3 className="text-sm font-bold">Добавить расход</h3>
          <div className="mt-3">
            <ExpenseFields
              action={addInstructorExpenseAction}
              today={vnToday()}
              categories={categories}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
