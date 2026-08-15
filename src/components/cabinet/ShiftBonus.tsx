import { setShiftBonusAction } from "@/app/[locale]/admin/actions";
import { SHIFT_PAY, SHIFT_PAY_LABEL, shiftPayStatus } from "@/lib/salary";
import { vnd } from "@/lib/stats";
import type { ShiftEntry } from "@/lib/shifts";

// Премия за выход в карточке дня: вердикт машины + ручка админа.
//
// Кнопка одна и делает одно действие («снять» либо «вернуть») — переключатель
// с отдельной кнопкой «Сохранить» здесь лишний: решение бинарное, а причина
// нужна только при снятии.
//
// Живёт в общих компонентах кабинета, потому что открыт он в двух календарях:
// у админа и у механика (премию снимает тот, кто чинит оборудование после
// неаккуратной смены). До 15.08.2026 это были две копии одного кода, буква в
// букву, — правка в одной из них другую не догоняла.
export function ShiftBonus({
  shift,
  date,
  instructorId,
}: {
  shift: ShiftEntry;
  date: string;
  instructorId: string;
}) {
  const status = shiftPayStatus(
    shift.openedAt,
    shift.closedAt,
    shift.bonusCancelled,
  );
  const paid = status === "paid";

  return (
    <div className="mt-2 rounded-xl bg-line/25 px-3 py-2">
      <p className="text-xs font-semibold">
        {paid ? (
          <span className="text-primary">Премия {vnd(SHIFT_PAY)} · зачтена</span>
        ) : (
          <span className="text-muted">
            Премия не начислена · {SHIFT_PAY_LABEL[status]}
          </span>
        )}
      </p>
      {shift.bonusCancelled && shift.bonusComment && (
        <p className="mt-0.5 text-xs text-muted">Причина: {shift.bonusComment}</p>
      )}

      <form action={setShiftBonusAction} className="mt-2 flex items-center gap-1.5">
        <input type="hidden" name="instructorId" value={instructorId} />
        <input type="hidden" name="date" value={date} />
        <input type="hidden" name="cancelled" value={shift.bonusCancelled ? "0" : "1"} />
        {!shift.bonusCancelled && (
          <input
            type="text"
            name="comment"
            placeholder="причина"
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 py-1.5 text-xs outline-none focus:border-primary"
          />
        )}
        <button
          type="submit"
          className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
            shift.bonusCancelled
              ? "border-line text-muted hover:border-primary hover:text-primary"
              : "border-line text-muted hover:border-red-500 hover:text-red-500"
          }`}
        >
          {shift.bonusCancelled ? "Вернуть премию" : "Снять премию"}
        </button>
      </form>
    </div>
  );
}
