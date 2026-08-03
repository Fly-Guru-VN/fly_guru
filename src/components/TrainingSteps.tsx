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

// Занятие по шагам — дорожка с нумерованными кружками слева и карточкой шага
// справа, по макету.
//
// Линия и кружки лежат ОТДЕЛЬНО от карточек, слева от них: так видно, что это
// последовательность, а не четыре независимые плашки. Под последним кружком
// линия становится пунктиром и обрывается — занятие кончилось, дальше вы
// катаетесь сами.
export function TrainingSteps({ steps }: { steps: TrainingStep[] }) {
  return (
    <ol className="relative">
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        return (
          <li key={s.title} className="relative pb-4 pl-14 last:pb-0 sm:pl-16">
            {/* Отрезок линии до следующего кружка. У последнего шага вместо
                него короткий пунктирный хвост — он не соединяет ни с чем и
                просто гасит дорожку. */}
            {last ? (
              <span
                aria-hidden
                className="absolute left-[1.28rem] top-[3.6rem] h-10 w-0.5 bg-[repeating-linear-gradient(to_bottom,var(--color-primary)_0_3px,transparent_3px_9px)] opacity-30 sm:left-[1.53rem]"
              />
            ) : (
              <span
                aria-hidden
                className="absolute bottom-0 left-[1.28rem] top-[3.6rem] w-0.5 bg-primary/20 sm:left-[1.53rem]"
              />
            )}

            {/* Номер шага. ring — бледный ореол вокруг кружка, как в макете:
                без него кружок на светлом фоне выглядит наклейкой. */}
            <span
              aria-hidden
              className={`absolute left-1 top-3 flex h-11 w-11 items-center justify-center rounded-full border-2 bg-surface text-lg font-bold ${
                s.highlight
                  ? "animate-step-glow border-accent text-accent ring-8 ring-accent/5"
                  : "border-primary/35 text-primary ring-8 ring-primary/5"
              }`}
            >
              {i + 1}
            </span>

            <div className="rounded-2xl bg-gradient-to-br from-surface-2 via-surface to-surface p-4 shadow-[0_14px_30px_-24px_rgba(15,34,51,0.5)] sm:p-5">
              <div className="flex items-start gap-4">
                <Image
                  src={s.image}
                  alt=""
                  aria-hidden
                  width={320}
                  height={320}
                  sizes="128px"
                  className="hidden h-24 w-24 shrink-0 sm:block"
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
                className="mx-auto mt-2 h-24 w-24 sm:hidden"
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
