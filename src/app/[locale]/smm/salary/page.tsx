import type { Metadata } from "next";
import { getAppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCrmPayout } from "@/lib/finance";
import { vnMonth } from "@/lib/dates";
import { SMM_WEEK_PAY } from "@/lib/salary";
import { vnd } from "@/lib/stats";
import { CalMonthNav, resolveCalYm } from "@/components/cabinet/CalMonthNav";
import { PageHeader } from "@/components/cabinet/PageHeader";
import { PageNote } from "@/components/cabinet/PageNote";

export const metadata: Metadata = { title: "СММ · Моя ЗП" };

// «Моя ЗП» в кабинете СММщика (prompt 11, п.3).
//
// Показываем ровно то, о чём просил David: фикс появляется ТОЛЬКО после того,
// как начальник отметил выплату на «Расчёте выплат». Начисленного здесь нет
// вовсе — у инструктора в кабинете видно «заработано на сейчас», а у СММщика
// нет: пока деньги не отданы, спорить не о чем, а недельный фикс всё равно не
// зависит от того, сколько он сегодня наработал.
//
// Второе слагаемое — 1% с выручки — наоборот, только начисленное: он копится
// весь месяц и выплачивается в конце. Это та же самая половина доли CRM, что
// видит начальник (lib/finance, CRM_RATE пополам): второй раз она нигде не
// начисляется.
//
// Читаем служебным ключом: salary_payouts по RLS открыта одному админу (0036),
// и открывать её политикой ещё и СММщику ради одного экрана не хочется —
// в таблице лежат выплаты всей школы. Служебным ключом берём строго свои
// строки, наружу уходит только его собственная выплата.

function paidLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  });
}

function periodLabel(from: string, to: string): string {
  const fmt = (day: string) =>
    new Date(`${day}T00:00:00Z`).toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  return `${fmt(from)} — ${fmt(to)}`;
}

export default async function SmmSalaryPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const { m } = await searchParams;
  const ym = resolveCalYm(m);
  const month = vnMonth(ym);

  const user = await getAppUser();
  if (!user) return null; // layout уже средиректил бы; страховка для типов

  const admin = createAdminClient();
  const [payoutsRes, crm] = await Promise.all([
    admin
      .from("salary_payouts")
      .select("id, period_from, period_to, amount, paid_at")
      .eq("instructor_id", user.id)
      .gte("paid_at", month.fromIso)
      .lt("paid_at", month.toIso)
      .order("paid_at", { ascending: false }),
    getCrmPayout(admin, month),
  ]);

  // Выплаты считаем по дате ОТМЕТКИ, а не по периоду: вопрос, на который
  // отвечает экран, — «сколько мне отдали в этом месяце», а выплата за
  // последнюю неделю июля попадает на руки уже в августе.
  const payouts = (payoutsRes.data ?? []).map((p) => ({
    id: p.id as string,
    from: p.period_from as string,
    to: p.period_to as string,
    amount: Number(p.amount ?? 0),
    paidAt: p.paid_at as string,
  }));
  const paidTotal = payouts.reduce((s, p) => s + p.amount, 0);

  return (
    <div>
      <PageHeader title="Моя ЗП" hint="Что уже выплачено и что копится" />
      <PageNote>
        <p>
          Зарплата складывается из двух частей. Фикс — {vnd(SMM_WEEK_PAY)} за
          неделю работы; он появляется здесь после того, как начальник отметил
          выплату, поэтому это список уже отданных денег, а не «сколько мне
          должны на сегодня».
        </p>
        <p>
          Вторая часть — 1% с каждого чека школы. Он копится весь месяц и
          выплачивается в конце: цифра ниже растёт с каждым занятием и
          абонементом, оплаченными в этом месяце.
        </p>
      </PageNote>

      <CalMonthNav ym={ym} basePath="/smm/salary" />

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-xs text-muted">Выплачено в этом месяце</p>
          <p className="mt-1 text-3xl font-bold text-primary">{vnd(paidTotal)}</p>
          <p className="mt-1 text-xs text-muted">
            фикс, {vnd(SMM_WEEK_PAY)} за неделю
          </p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-xs text-muted">1% с выручки · {month.label}</p>
          <p className="mt-1 text-3xl font-bold">{vnd(crm.each)}</p>
          <p className="mt-1 text-xs text-muted">
            копится и выплачивается в конце месяца
          </p>
        </div>
      </div>

      <section className="mt-3 rounded-2xl border border-line bg-surface p-4">
        <h2 className="font-bold">Выплаты</h2>
        <div className="mt-3 space-y-3">
          {payouts.map((p) => (
            <div
              key={p.id}
              className="flex items-baseline justify-between gap-2 border-b border-line/70 pb-2 last:border-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  За {periodLabel(p.from, p.to)}
                </p>
                <p className="text-xs text-muted">
                  отмечено {paidLabel(p.paidAt)}
                </p>
              </div>
              <p className="shrink-0 font-bold text-primary">{vnd(p.amount)}</p>
            </div>
          ))}
          {payouts.length === 0 && (
            <p className="text-sm text-muted">
              В этом месяце выплат пока нет. Как только начальник отметит
              выплату, она появится здесь.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
