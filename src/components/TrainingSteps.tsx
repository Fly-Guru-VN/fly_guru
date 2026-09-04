import Image from "next/image";

export type TrainingStep = {
  // Оранжевая подпись над заголовком: сколько это длится или как называется
  // этап целиком.
  meta: string;
  title: string;
  text: string;
  // Круглая иллюстрация шага.
  image: string;
  // Последний шаг: метка другого цвета и с живым свечением.
  highlight?: boolean;
};

// Занятие по шагам. Два разных вида под ПК и под телефон — переключаются по
// `md` (768 px).
//
// ПК: дорожка — нумерованные кружки с линией ОТДЕЛЬНО, слева от карточек. Так
// видно, что это последовательность, а не четыре независимые плашки. Под
// последним кружком линия становится пунктиром и обрывается — занятие
// кончилось, дальше вы катаетесь сами.
//
// Телефон: дорожки нет (на 330 px она съедала бы четверть ширины), карточки
// стоят по центру экрана, а кружок с номером сидит верхом на верхней границе
// своей карточки — ровно наполовину над ней, как в макете `ref_steps`.
export function TrainingSteps({ steps }: { steps: TrainingStep[] }) {
  return (
    <ol className="relative">
      {steps.map((s, i) => {
        const first = i === 0;
        const last = i === steps.length - 1;
        // На телефоне сверху оставлен pt-7 — это половина кружка, торчащая над
        // карточкой, плюс воздух до предыдущего шага.
        // На ПК зазор задан симметричным py-2, а не pb-4 снизу: так середина
        // элемента списка совпадает с серединой карточки, и кружок с номером,
        // который центрируется по элементу, встаёт ровно по центру своей
        // плашки.
        return (
          <li key={s.title} className="relative pb-5 pt-7 md:py-2 md:pl-16">
            {/* Линия идёт сквозь всю дорожку, а кружки лежат ПОВЕРХ неё и
                закрывают её собой (у них своя заливка). Считать отрезки от
                кружка до кружка нельзя: кружок стоит по центру своей карточки,
                а карточки разной высоты.
                У первого шага линия начинается от центра кружка, у последнего
                там же обрывается — до и после занятия дорожки нет. */}
            <span
              aria-hidden
              className={`absolute left-[1.53rem] hidden w-0.5 bg-primary/20 md:block ${
                first ? "top-1/2" : "top-0"
              } ${last ? "bottom-1/2" : "bottom-0"}`}
            />
            {/* Пунктирный хвост под последним кружком: занятие кончилось,
                дальше вы катаетесь сами. */}
            {last && (
              <span
                aria-hidden
                className="absolute left-[1.53rem] top-1/2 hidden h-10 w-0.5 bg-[repeating-linear-gradient(to_bottom,var(--color-primary)_0_3px,transparent_3px_9px)] opacity-30 md:block"
              />
            )}

            {/* Номер шага. На телефоне — по центру верхнего края карточки
                (граница карточки проходит через центр кружка), на ПК — слева,
                ровно по центру своей карточки. ring — бледный ореол вокруг
                кружка, как в макете: без него кружок на светлом фоне выглядит
                наклейкой. */}
            <span
              aria-hidden
              className={`absolute left-1/2 top-7 z-10 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 bg-surface text-lg font-bold md:left-1 md:top-1/2 md:translate-x-0 ${
                s.highlight
                  ? "animate-step-glow border-accent text-accent ring-8 ring-accent/5"
                  : "border-primary/35 text-primary ring-8 ring-primary/5"
              }`}
            >
              {i + 1}
            </span>

            {/* Верхнее поле на телефоне больше остальных: под кружком должно
                остаться место, иначе он ложится на оранжевую подпись. */}
            <div className="rounded-3xl bg-gradient-to-br from-surface-2 via-surface to-surface px-5 pb-5 pt-8 shadow-[0_18px_36px_-26px_rgba(15,34,51,0.55)] md:rounded-2xl md:p-5">
              <div className="flex items-start gap-4">
                <Image
                  src={s.image}
                  alt=""
                  aria-hidden
                  width={320}
                  height={320}
                  sizes="128px"
                  // Иллюстрации шагов — анимированные WebP. Оптимизатор Next
                  // всё равно отдаёт их как есть и без флага пишет warning.
                  unoptimized
                  className="hidden h-24 w-24 shrink-0 md:block"
                />
                <div className="min-w-0">
                  <p className="text-xs font-extrabold uppercase tracking-wide text-accent-strong">
                    {s.meta}
                  </p>
                  <h3 className="mt-1 text-lg font-bold leading-tight sm:text-xl">{s.title}</h3>
                  <p className="mt-2 text-sm text-muted">{s.text}</p>
                </div>
              </div>
              {/* На телефоне иллюстрация уходит под текст во всю ширину: рядом
                  с текстом в узкой карточке на неё остаётся 60 px, и фигурка
                  превращается в точку. */}
              <Image
                src={s.image}
                alt=""
                aria-hidden
                width={320}
                height={320}
                sizes="128px"
                unoptimized
                className="mx-auto mt-3 h-28 w-28 md:hidden"
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
