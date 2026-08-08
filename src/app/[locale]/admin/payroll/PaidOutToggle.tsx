import { markSalaryPaidAction, unmarkSalaryPaidAction } from "../actions";
import { ConfirmSubmit } from "../ConfirmSubmit";
import { vnd } from "@/lib/stats";
import type { PayoutMark } from "@/lib/payroll";

// Отметка «ЗП за этот период выдана» (0036).
//
// Зачем: «Расходы» показывают НАЧИСЛЕННУЮ ЗП — она попадает в расчёт в момент
// записи занятия. А деньги на руки отдают раз в неделю и не всегда всем сразу
// (кто-то в отъезде). Начальнику нужно помнить, кому он уже отдал, — вот эта
// галочка. На прибыль она не влияет: прибыль считается от начисленного.
//
// Отметка привязана к ТОЧНЫМ границам периода: «выплачено за 3–9 августа».
// Пересчёт недели в месяц её не подхватит — и это правильно, месяц закрывают
// отдельно.

function paidLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  });
}

export function PaidOutToggle({
  instructorId,
  from,
  to,
  amount,
  paidOut,
}: {
  instructorId: string;
  from: string;
  to: string;
  amount: number;
  paidOut: PayoutMark | null;
}) {
  const hidden = (
    <>
      <input type="hidden" name="instructorId" value={instructorId} />
      <input type="hidden" name="from" value={from} />
      <input type="hidden" name="to" value={to} />
    </>
  );

  if (paidOut) {
    // Сумма в отметке — снимок на момент нажатия. Если расчёт с тех пор
    // изменился (поправили занятие в закрытой неделе), показываем обе цифры:
    // молча подменять историю выплаты нельзя.
    const drifted = Math.round(paidOut.amount) !== Math.round(amount);
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
          Выплачено {vnd(paidOut.amount)} · {paidLabel(paidOut.paidAt)}
        </span>
        {drifted && (
          <span className="text-[11px] text-muted">
            расчёт изменился: сейчас {vnd(amount)}
          </span>
        )}
        <form action={unmarkSalaryPaidAction}>
          {hidden}
          <ConfirmSubmit
            message="Снять отметку о выплате за этот период?"
            className="text-[11px] font-semibold text-muted transition-colors hover:text-red-600"
          >
            Снять отметку
          </ConfirmSubmit>
        </form>
      </div>
    );
  }

  if (amount <= 0) return null; // платить нечего — и кнопка не нужна

  return (
    <form action={markSalaryPaidAction} className="mt-2">
      {hidden}
      <input type="hidden" name="amount" value={Math.round(amount)} />
      <button
        type="submit"
        className="rounded-full border border-line px-3 py-1 text-[11px] font-semibold text-muted transition-colors hover:border-primary hover:text-primary"
      >
        Отметить «выплачено»
      </button>
    </form>
  );
}
