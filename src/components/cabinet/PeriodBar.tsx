import { Link } from "@/i18n/navigation";
import { NATIVE_PICKER } from "@/components/cabinet/fieldClasses";

// Выбор периода: готовые отрезки слева, свои даты справа.
//
// Раньше на каждом экране со статистикой это занимало три яруса по вертикали —
// строка чипсов, под ней два поля дат, под ними кнопка «Показать» во всю их
// ширину. На ПК полтора экрана уходило на управление, прежде чем начинались
// сами цифры. Здесь всё живёт одной строкой (на узких экранах переносится).
//
// Поля дат остаются компактными, без w-full: растянутый нативный календарь
// вылезает за край экрана (грабли из пачки №5).

export interface Preset {
  label: string;
  href: string;
  active: boolean;
}

const presetClass = (active: boolean) =>
  `rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
    active
      ? "bg-primary text-white"
      : "border border-line text-muted hover:border-primary hover:text-primary"
  }`;

const fieldClass = `${NATIVE_PICKER} rounded-xl border border-line bg-surface px-3 py-1.5 text-sm outline-none focus:border-primary`;

export function PeriodBar({
  presets,
  fromDay,
  toDay,
  today,
  hidden,
}: {
  presets: Preset[];
  fromDay: string;
  toDay: string;
  today: string;
  /** Поля, которые должны пережить submit формы (фильтры экрана). */
  hidden?: Record<string, string>;
}) {
  return (
    <div className="mt-4 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <Link key={p.label} href={p.href} className={presetClass(p.active)}>
            {p.label}
          </Link>
        ))}
      </div>

      {/* flex-wrap до lg: на телефоне два нативных поля даты и кнопка в одну
          строку не помещаются (390 px), а сжиматься нативный календарь не
          умеет (NATIVE_PICKER) — кнопка «Показать» уезжала за правый край
          экрана и нажать её было нельзя. Теперь она переносится под даты, а на
          ПК строка остаётся одной, как и была. */}
      <form className="flex flex-wrap items-end gap-2 lg:shrink-0 lg:flex-nowrap" action="">
        {Object.entries(hidden ?? {}).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <label className="flex flex-col items-start text-[11px] text-muted">
          С
          <input
            type="date"
            name="from"
            defaultValue={fromDay}
            max={today}
            className={fieldClass}
          />
        </label>
        <label className="flex flex-col items-start text-[11px] text-muted">
          По
          <input
            type="date"
            name="to"
            defaultValue={toDay}
            max={today}
            className={fieldClass}
          />
        </label>
        <button
          type="submit"
          className="rounded-xl border border-primary px-4 py-1.5 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
        >
          Показать
        </button>
      </form>
    </div>
  );
}
