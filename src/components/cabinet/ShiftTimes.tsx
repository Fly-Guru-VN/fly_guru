import { vnTimeLabel } from "@/lib/dates";
import {
  shiftStatus,
  OPEN_LABEL,
  CLOSE_LABEL,
  statusClass,
} from "@/lib/shiftRules";

// Плашки «во сколько открыл и закрыл смену». Раньше эта разметка жила копией в
// админском и инструкторском календарях; с появлением механика вариантов стало
// два, и держать их врозь — верный способ получить расхождение.
//
// strict — применять ли регламент 9:00/18:00 (пометки «вовремя / поздно /
// залёт» и красный цвет). У инструктора он есть: за выход по регламенту платят
// 200 000 ₫. У механика регламента нет — он открывает смену когда нужно, и
// показывать ему «поздно» значило бы ругать за то, о чём не договаривались.
// Поэтому там просто время.
export function ShiftTimes({
  openedAt,
  closedAt,
  strict = true,
}: {
  openedAt: string | null;
  closedAt: string | null;
  strict?: boolean;
}) {
  const status = shiftStatus(openedAt, closedAt);
  const badge = "rounded-full px-2.5 py-1 text-xs font-semibold";
  const idle = `${badge} bg-line/40 text-muted`;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {openedAt ? (
        <span
          className={`${badge} ${statusClass(strict && status.open === "late")}`}
        >
          Открыл {vnTimeLabel(openedAt)}
          {strict && ` · ${OPEN_LABEL[status.open]}`}
        </span>
      ) : (
        <span className={idle}>Не открыл</span>
      )}

      {closedAt ? (
        <span
          className={`${badge} ${statusClass(strict && status.close === "early")}`}
        >
          Закрыл {vnTimeLabel(closedAt)}
          {strict && ` · ${CLOSE_LABEL[status.close]}`}
        </span>
      ) : openedAt ? (
        <span className={idle}>Не закрыл</span>
      ) : null}
    </div>
  );
}
