import { Link } from "@/i18n/navigation";
import { vnCurrentMonth, vnMonth } from "@/lib/dates";

// Переключатель месяцев для КАЛЕНДАРЯ (пак H1). В отличие от MonthSwitcher
// (расчёт/статистика — только прошлое) пускает и в будущее: смены планируют
// наперёд. Переход на другой месяц сбрасывает выбранный день (?d).

function shiftYm(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

// Валидный 'YYYY-MM' из ?m= (любой месяц); мусор/пусто → текущий.
export function resolveCalYm(m: string | undefined): string {
  return /^\d{4}-\d{2}$/.test(m ?? "") ? m! : vnCurrentMonth().fromDay.slice(0, 7);
}

export function CalMonthNav({
  ym,
  basePath,
  // Отступ сверху — снаружи: в админке переключатель стоит в строке заголовка,
  // где верхний отступ лишний. По умолчанию как было.
  className = "mt-3",
}: {
  ym: string;
  basePath: string;
  className?: string;
}) {
  const currentYm = vnCurrentMonth().fromDay.slice(0, 7);
  return (
    // Стрелки — круглые кнопки с подложкой: на телефоне в них проще попасть
    // пальцем, чем в голый символ, и переключатель перестал выглядеть текстом.
    <div
      className={`flex items-center justify-between rounded-2xl border border-line bg-surface px-2 py-2 ${className}`}
    >
      <Link
        href={`${basePath}?m=${shiftYm(ym, -1)}`}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-lg text-muted transition-colors hover:bg-primary/10 hover:text-primary"
        aria-label="Предыдущий месяц"
      >
        ‹
      </Link>
      <span className="flex items-center gap-2 text-base font-bold">
        {/* first-letter, а не capitalize: Intl отдаёт «июль 2026 г.», и
            capitalize поднимал заодно «г.» — в шапке висело «Июль 2026 Г.».
            Псевдоэлемент работает только на блоке, поэтому отдельный span:
            на flex-контейнере ::first-letter не применяется. */}
        <span className="block first-letter:uppercase">{vnMonth(ym).label}</span>
        {ym !== currentYm && (
          <Link
            href={basePath}
            className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
          >
            сегодня
          </Link>
        )}
      </span>
      <Link
        href={`${basePath}?m=${shiftYm(ym, 1)}`}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-lg text-muted transition-colors hover:bg-primary/10 hover:text-primary"
        aria-label="Следующий месяц"
      >
        ›
      </Link>
    </div>
  );
}
