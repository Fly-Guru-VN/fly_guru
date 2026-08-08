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

// Строка выплаты: за что платим — слева, сумма — справа, подробности мелким
// под ней. Раньше все подробности («занятия (12) · 10 000 000 ₫») лезли в саму
// подпись, и на телефоне их срезало `truncate`: строка обрывалась на середине,
// а из-за подписи «Занятия (0) · 0 ₫» рядом с суммой 562 500 ₫ расчёт выглядел
// сломанным. Теперь подпись короткая (не обрезается), а цифры — отдельной
// строкой под ней. Пунктирная выноска осталась только на широком экране: на
// телефоне она превращалась в обрубок в пару пикселей.
function Row({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline gap-2 text-sm">
        <span className="min-w-0 text-muted">{label}</span>
        <span className="hidden min-w-4 flex-1 border-b border-dotted border-line sm:block" />
        <span className="ml-auto shrink-0 font-semibold tabular-nums sm:ml-0">
          {value}
        </span>
      </div>
      {hint && <p className="text-xs text-muted/80">{hint}</p>}
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
          делятся поровну между теми, кто в этот день открыл смену — даже если
          смена не стояла в календаре; если не открылся никто, делим между
          назначенными, а в дни совсем без смен 15% идут тому, кто записал. 15% с абонементов, проданных инструкторами,
          делится между ними поровну. Ваши сессии и абонементы в расчёт не идут.
        </p>
        <div className="mt-3 space-y-4">
          {payroll.instructors.map((i) => (
            <div key={i.id}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-semibold">{i.name}</p>
                <p className="font-bold text-primary">{vnd(i.total)}</p>
              </div>
              <div className="mt-1 space-y-1.5">
                {/* Сумма тут — доля с занятий ДНЯ, а не 15% со своих чеков:
                    она делится между вышедшими на смену. Поэтому подпись
                    говорит про долю, а собственные занятия ушли в пояснение —
                    иначе «Занятия (0)» рядом с полумиллионом читалось как сбой
                    (у человека действительно бывает 0 своих записей и при этом
                    доля за день, отработанный в паре). */}
                <Row
                  label="Доля 15% с занятий дня"
                  value={vnd(i.salaryFromSessions)}
                  hint={`свои занятия: ${i.sessionsCount} на ${vnd(i.sessionsRevenue)}`}
                />
                <Row
                  label={`Выходы · зачтено ${i.shiftsCount} из ${i.shiftsCount + i.shiftsUnpaidCount}`}
                  value={vnd(i.salaryFromShifts)}
                  hint={[
                    i.shiftsUnpaidCount > 0
                      ? `не зачтено ${i.shiftsUnpaidCount} — регламент или снятая премия`
                      : null,
                    // Будущие смены месяца больше не висят в «не зачтено»
                    // (см. getShiftPay), но показать их полезно: видно, сколько
                    // ещё добавится к выплате, если график отработают.
                    i.shiftsPlannedCount > 0
                      ? `в графике ещё ${i.shiftsPlannedCount} — до ${vnd(i.shiftsPlannedCount * SHIFT_PAY)}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                />
                <Row
                  label="Доля с абонементов"
                  value={vnd(i.salaryFromSubs)}
                  hint={`продал сам: ${i.paidSubsCount}`}
                />
              </div>
            </div>
          ))}
          {payroll.instructors.length === 0 && (
            <p className="text-sm text-muted">Инструкторов нет.</p>
          )}
        </div>
      </section>

      {/* Доля за CRM. Считается из выручки месяца, поэтому в списке людей её
          раньше не было — а платить-то надо, и каждый раз приходилось лезть во
          вкладку «Расходы». */}
      <section className="mt-3 rounded-2xl border border-line bg-surface p-4">
        <h2 className="font-bold">CRM · 2% с выручки пополам</h2>
        <p className="mt-1 text-xs text-muted">
          База — занятия месяца плюс абонементы, оплаченные в этом месяце:{" "}
          {vnd(payroll.crm.revenue)}.
        </p>
        <div className="mt-3 space-y-1">
          {payroll.crm.partners.map((name) => (
            <Row key={name} label={`${name} · 1%`} value={vnd(payroll.crm.each)} />
          ))}
          <div className="flex items-baseline justify-between gap-2 pt-1">
            <p className="text-sm font-semibold">Итого CRM</p>
            <p className="font-bold text-primary">{vnd(payroll.crm.total)}</p>
          </div>
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
              <p className="text-xs text-muted">Приведено клиентов: {a.confirmedCount}</p>
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
