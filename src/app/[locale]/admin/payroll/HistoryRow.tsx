import { dayShort } from "@/lib/dates";
import { vnd } from "@/lib/stats";
import type { PayoutRow } from "@/lib/payroll";
import { deleteSalaryPayoutAction } from "../actions";
import { ConfirmSubmit } from "../ConfirmSubmit";

// Одна выплата в истории. Кнопка удаления — на случай «ткнул не туда»:
// правки суммы нет намеренно, удалить и внести заново честнее.
export function HistoryRow({ p }: { p: PayoutRow }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/70 py-2 last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-semibold">
          {p.name}
          <span className="ml-2 text-xs font-normal text-muted">
            {dayShort(p.paidOn)}
          </span>
        </p>
        {(p.comment || p.period) && (
          <p className="truncate text-sm text-muted">
            {p.period
              ? `за ${dayShort(p.period.from)} — ${dayShort(p.period.to)}`
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
            className="-mr-2 px-2 py-1.5 text-xs font-semibold text-muted transition-colors hover:text-red-600"
          >
            удалить
          </ConfirmSubmit>
        </form>
      </div>
    </div>
  );
}
