import { Link } from "@/i18n/navigation";
import { vnCurrentMonth, vnMonth } from "@/lib/dates";

// Переключатель месяцев ‹ июль 2026 › для экранов «за выбранный месяц»
// (дашборд, расчёт месяца). Вперёд дальше текущего месяца не пускает.

// 'YYYY-MM' соседнего месяца для стрелок.
function shiftYm(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

// Валидный месяц из ?m= (или текущий, если параметра нет / мусор).
export function resolveYm(m: string | undefined): string {
  const currentYm = vnCurrentMonth().fromDay.slice(0, 7);
  return /^\d{4}-\d{2}$/.test(m ?? "") && m! <= currentYm ? m! : currentYm;
}

export function MonthSwitcher({ ym, basePath }: { ym: string; basePath: string }) {
  const currentYm = vnCurrentMonth().fromDay.slice(0, 7);

  return (
    <div className="mt-3 flex items-center justify-between rounded-2xl border border-line bg-surface px-2 py-1.5">
      <Link
        href={`${basePath}?m=${shiftYm(ym, -1)}`}
        className="rounded-full px-3 py-1.5 text-lg text-muted transition-colors hover:text-primary"
        aria-label="Предыдущий месяц"
      >
        ‹
      </Link>
      <span className="font-semibold first-letter:uppercase">{vnMonth(ym).label}</span>
      {ym < currentYm ? (
        <Link
          href={`${basePath}?m=${shiftYm(ym, 1)}`}
          className="rounded-full px-3 py-1.5 text-lg text-muted transition-colors hover:text-primary"
          aria-label="Следующий месяц"
        >
          ›
        </Link>
      ) : (
        <span className="px-3 py-1.5 text-lg text-line">›</span>
      )}
    </div>
  );
}
