// Содержимое одного дня в месячной сетке — общее для трёх календарей (админ,
// инструктор, механик). Раньше эта разметка лежала тремя копиями внутри страниц
// и уже начала расходиться по мелочам.
//
// Телефон и ПК показывают РАЗНОЕ, и это главное здесь. В ячейку шириной ~48 px
// имена не влезают: было «Евге…», «Серг…», «Ник…» — три обрезанных плашки, из
// которых ничего не понять. Поэтому на телефоне смены сжаты до точек (бирюзовая
// — своя, остальные по роли), а имена целиком показывает карточка дня по тапу.
// На ПК места хватает — там имена как были.

export interface DayCellShift {
  id: string;
  name: string;
  /** Своя смена — подсвечиваем фирменным цветом. */
  mine?: boolean;
  /** Роль вышедшего: от неё цвет плашки, если смена не своя. */
  role?: string;
}

// Цвет плашки по роли (решение David от 18.09.2026). Раньше цвета было два:
// своя смена бирюзовая, любая чужая оранжевая — и в дне из трёх человек было
// не видно, кто из них механик, а кто на пляже с клиентами. Теперь у механика
// зелёный, у СММщика голубой, у полевого состава прежний оранжевый.
//
// Своя смена остаётся бирюзовой при любой роли: на своём календаре человек
// ищет прежде всего себя, а не свою должность.
const ROLE_COLORS: Record<string, { dot: string; chip: string }> = {
  mechanic: { dot: "bg-emerald-500", chip: "bg-emerald-500/15 text-emerald-700" },
  smm: { dot: "bg-sky-500", chip: "bg-sky-500/15 text-sky-700" },
};

const OTHER_COLORS = { dot: "bg-accent", chip: "bg-accent/15 text-accent-strong" };

function colorsFor(s: DayCellShift) {
  return (s.role && ROLE_COLORS[s.role]) || OTHER_COLORS;
}

// Сколько точек показываем, прежде чем свернуть остальные в «+N».
const MAX_DOTS = 4;

export function CalendarDayCell({
  shifts,
  bookings,
}: {
  shifts: DayCellShift[];
  bookings: number;
}) {
  if (shifts.length === 0 && bookings === 0) return null;

  const dots = shifts.slice(0, MAX_DOTS);
  const rest = shifts.length - dots.length;

  return (
    <>
      {shifts.length > 0 && (
        <>
          {/* Телефон: точки */}
          <div className="flex flex-wrap items-center gap-1 sm:hidden">
            {dots.map((s) => (
              <span
                key={s.id}
                title={s.name}
                className={`h-2 w-2 rounded-full ${
                  s.mine ? "bg-primary" : colorsFor(s).dot
                }`}
              />
            ))}
            {rest > 0 && (
              <span className="text-[9px] font-bold leading-none text-muted">
                +{rest}
              </span>
            )}
          </div>

          {/* ПК: имена */}
          <div className="hidden space-y-0.5 sm:block">
            {shifts.map((s) => (
              <span
                key={s.id}
                title={s.name}
                className={`block truncate rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${
                  s.mine ? "bg-primary text-white" : colorsFor(s).chip
                }`}
              >
                {s.name}
              </span>
            ))}
          </div>
        </>
      )}

      {bookings > 0 && (
        <span className="mt-1 inline-block rounded-md bg-primary/10 px-1 py-0.5 text-[9px] font-semibold leading-none text-primary sm:px-1.5 sm:text-[11px]">
          {bookings} зап.
        </span>
      )}
    </>
  );
}
