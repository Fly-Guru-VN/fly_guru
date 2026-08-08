import { markSalaryPaidAction, unmarkSalaryPaidAction } from "../actions";
import { ConfirmSubmit } from "../ConfirmSubmit";
import { vnd } from "@/lib/stats";
import type { PayoutMark } from "@/lib/payroll";

// Отметка «ЗП за этот период выдана» (0036).
//
// Зачем: «Расходы» показывают НАЧИСЛЕННУЮ ЗП — она попадает в расчёт в момент
// записи занятия. А деньги на руки отдают раз в неделю и не всегда всем сразу
// (кто-то в отъезде). Начальнику нужно помнить, кому он уже отдал, — вот эта
// отметка. На прибыль она не влияет: прибыль считается от начисленного.
//
// Одни и те же дни закрываются выплатой ТОЛЬКО ОДИН РАЗ. Раньше отметка была
// привязана к точным границам периода, и это давало дыру: отметил за 1–5,
// потом открыл 1–8 и отметил снова — неделя выдана дважды, а на экране обе
// отметки выглядели независимыми. Теперь показываем все выплаты, которые
// задевают выбранный период, и второй раз те же дни закрыть нельзя.

// «1—5 авг» / «28 июл — 3 авг»: месяц у первой даты печатаем, только если он
// отличается — так подпись короче и читается одним взглядом.
function periodLabel(from: string, to: string): string {
  const fmt = (day: string, withMonth: boolean) =>
    new Date(`${day}T00:00:00Z`).toLocaleDateString("ru-RU", {
      day: "numeric",
      ...(withMonth ? { month: "short" } : {}),
      timeZone: "UTC",
    });
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  return `${fmt(from, !sameMonth)} — ${fmt(to, true)}`;
}

function paidLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  });
}

// Одна выплата строкой. Период стоит первым: именно он отвечает на вопрос
// «а за какие дни это было», из-за которого и случались двойные выдачи.
function PayoutBadge({ p }: { p: PayoutMark }) {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
      <span>Выплачено за {periodLabel(p.from, p.to)}</span>
      <span aria-hidden>·</span>
      <span>{vnd(p.amount)}</span>
      <span aria-hidden>·</span>
      <span className="font-normal">отмечено {paidLabel(p.paidAt)}</span>
    </span>
  );
}

export function PaidOutToggle({
  instructorId,
  from,
  to,
  amount,
  payouts,
  exactPayout,
  blocked,
  clash,
}: {
  instructorId: string;
  from: string;
  to: string;
  amount: number;
  payouts: PayoutMark[]; // все выплаты, задевающие выбранный период
  exactPayout: PayoutMark | null; // ровно за этот период — её можно снять
  blocked: boolean; // дни закрыты другой выплатой
  clash: boolean; // сюда только что пришёл отказ от сервера
}) {
  const hidden = (
    <>
      <input type="hidden" name="instructorId" value={instructorId} />
      <input type="hidden" name="from" value={from} />
      <input type="hidden" name="to" value={to} />
    </>
  );

  // Сумма в отметке — снимок на момент нажатия. Если расчёт с тех пор
  // изменился (поправили занятие в закрытой неделе), показываем обе цифры:
  // молча подменять историю выплаты нельзя.
  const drifted =
    exactPayout && Math.round(exactPayout.amount) !== Math.round(amount);

  return (
    <div className="mt-2 space-y-1.5">
      {payouts.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {payouts.map((p) => (
            <PayoutBadge key={p.id} p={p} />
          ))}
        </div>
      )}

      {drifted && (
        <p className="text-[11px] text-muted">
          расчёт изменился: сейчас {vnd(amount)}
        </p>
      )}

      {blocked && (
        <p className="text-[11px] font-semibold text-red-600">
          За эти дни выплата уже была — выберите период, который её не задевает.
          {clash && " Отметить второй раз нельзя."}
        </p>
      )}

      {exactPayout && (
        <form action={unmarkSalaryPaidAction}>
          {hidden}
          <ConfirmSubmit
            message="Снять отметку о выплате за этот период?"
            className="text-[11px] font-semibold text-muted transition-colors hover:text-red-600"
          >
            Снять отметку
          </ConfirmSubmit>
        </form>
      )}

      {/* Кнопка — только когда за эти дни ещё не платили и платить есть что. */}
      {!exactPayout && !blocked && amount > 0 && (
        <form action={markSalaryPaidAction}>
          {hidden}
          <input type="hidden" name="amount" value={Math.round(amount)} />
          <button
            type="submit"
            className="rounded-full border border-line px-3 py-1 text-[11px] font-semibold text-muted transition-colors hover:border-primary hover:text-primary"
          >
            Отметить «выплачено»
          </button>
        </form>
      )}
    </div>
  );
}
