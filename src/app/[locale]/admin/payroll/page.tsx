import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { vnMonth } from "@/lib/dates";
import { vnd } from "@/lib/stats";
import { SHIFT_PAY } from "@/lib/salary";
import { getMonthlyPayroll } from "@/lib/payroll";
import { MonthSwitcher, resolveYm } from "../MonthSwitcher";

export const metadata: Metadata = { title: "Админка · Расчёт месяца" };

// Расчёт месяца: кому и сколько выплатить. Инструкторы — 15% сессий + 15%
// оплаченных В ЭТОМ месяце абонементов (месяц оплаты, не продажи — цифры
// совпадают со статистикой в кабинете инструктора). Агенты — награды,
// подтверждённые в этом месяце. CSV — та же таблица файлом для архива.

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span className="min-w-0 truncate text-muted">{label}</span>
      <span className="min-w-4 flex-1 border-b border-dotted border-line" />
      <span className="shrink-0 font-semibold">{value}</span>
    </div>
  );
}

export default async function AdminPayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const { m } = await searchParams;
  const ym = resolveYm(m);
  const month = vnMonth(ym);

  const supabase = await createClient();
  const payroll = await getMonthlyPayroll(supabase, month);

  return (
    <div>
      <h1 className="text-2xl font-bold">Расчёт месяца</h1>
      <p className="mt-1 text-sm text-muted">
        Выплаты по факту оплаты: абонемент попадает в расчёт в месяц оплаты,
        награда агента — в месяц подтверждения.
      </p>

      <MonthSwitcher ym={ym} basePath="/admin/payroll" />

      <div className="mt-3 rounded-2xl border border-line bg-surface p-4">
        <p className="text-xs text-muted">Итого к выплате за {month.label}</p>
        <p className="mt-1 text-3xl font-bold text-primary">{vnd(payroll.grandTotal)}</p>
        <a
          href={`/api/admin/payroll?m=${ym}`}
          download
          className="mt-3 inline-block rounded-full border border-line px-4 py-2 text-xs font-semibold text-muted transition-colors hover:border-primary hover:text-primary"
        >
          Скачать CSV
        </a>
      </div>

      <section className="mt-3 rounded-2xl border border-line bg-surface p-4">
        <h2 className="font-bold">
          Инструкторы · {vnd(SHIFT_PAY)} за выход + 15% занятий + доля абонементов
        </h2>
        <p className="mt-1 text-xs text-muted">
          За выход платим, если смена закрыта, открыта до 9:00 и закрыта после
          18:00 (премию можно снять руками в календаре). 15% с занятий дня
          делятся поровну между теми, у кого в этот день смена; в дни без смен
          идут тому, кто записал. 15% с абонементов, проданных инструкторами,
          делится между ними поровну. Ваши сессии и абонементы в расчёт не идут.
        </p>
        <div className="mt-3 space-y-4">
          {payroll.instructors.map((i) => (
            <div key={i.id}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-semibold">{i.name}</p>
                <p className="font-bold text-primary">{vnd(i.total)}</p>
              </div>
              <div className="mt-1 space-y-1">
                <Row
                  label={`Занятия (${i.sessionsCount}) · ${vnd(i.sessionsRevenue)}`}
                  value={vnd(i.salaryFromSessions)}
                />
                <Row
                  label={
                    // Незачтённые выходы показываем прямо в подписи: иначе
                    // «выходов 3» при 11 отработанных днях выглядит как сбой.
                    i.shiftsUnpaidCount > 0
                      ? `Выходы (${i.shiftsCount}) · не зачтено ${i.shiftsUnpaidCount}`
                      : `Выходы (${i.shiftsCount})`
                  }
                  value={vnd(i.salaryFromShifts)}
                />
                <Row
                  label={`Доля абонементов · продал сам ${i.paidSubsCount}`}
                  value={vnd(i.salaryFromSubs)}
                />
              </div>
            </div>
          ))}
          {payroll.instructors.length === 0 && (
            <p className="text-sm text-muted">Инструкторов нет.</p>
          )}
        </div>
      </section>

      <section className="mt-3 rounded-2xl border border-line bg-surface p-4">
        <h2 className="font-bold">Агенты · за приведённых клиентов</h2>
        <div className="mt-3 space-y-3">
          {payroll.agents.map((a) => (
            <div key={a.id}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-semibold">{a.name}</p>
                <p className="font-bold text-primary">{vnd(a.total)}</p>
              </div>
              <p className="text-xs text-muted">
                Подтверждено клиентов: {a.confirmedCount}
                {a.pendingCount > 0 && ` · ожидают подтверждения: ${a.pendingCount}`}
              </p>
            </div>
          ))}
          {payroll.agents.length === 0 && (
            <p className="text-sm text-muted">Выплат агентам в этом месяце нет.</p>
          )}
        </div>
      </section>
    </div>
  );
}
