// Содержимое одного дня в месячной сетке — общее для трёх календарей (админ,
// инструктор, механик). Раньше эта разметка лежала тремя копиями внутри страниц
// и уже начала расходиться по мелочам.
//
// Телефон и ПК показывают РАЗНОЕ, и это главное здесь. В ячейку шириной ~48 px
// имена не влезают: было «Евге…», «Серг…», «Ник…» — три обрезанных плашки, из
// которых ничего не понять. Поэтому на телефоне смены сжаты до точек (бирюзовая
// — своя, оранжевые — чужие), а имена целиком показывает карточка дня по тапу.
// На ПК места хватает — там имена как были.

export interface DayCellShift {
  id: string;
  name: string;
  /** Своя смена — подсвечиваем фирменным цветом. */
  mine?: boolean;
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
                  s.mine ? "bg-primary" : "bg-accent"
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
                  s.mine
                    ? "bg-primary text-white"
                    : "bg-accent/15 text-accent-strong"
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
