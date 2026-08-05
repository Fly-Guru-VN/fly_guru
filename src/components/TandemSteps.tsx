import Image from "next/image";
import { DotsRail } from "./DotsRail";
import { RailItem } from "./Rail";

export type TandemStep = {
  title: string;
  text: string;
  // Иллюстрация шага (синяя графика на белом), обрезанная в край фигуры.
  image: string;
};

// «Как проходит тандем» по макету: три шага в ряд внутри одной белой плашки,
// между ними — короткий пунктир. Номер шага стоит слева над иллюстрацией.
//
// Два вида:
//  • ПК (от md) — ряд из трёх колонок внутри общей плашки, как в макете;
//  • телефон — лента с точками (как отзывы и шаги на главной): три высокие
//    карточки одна под другой заняли бы почти три экрана прокрутки. Общая
//    плашка на телефоне не нужна — там каждый шаг сам себе карточка.
export function TandemSteps({ steps }: { steps: TandemStep[] }) {
  return (
    <div className="md:rounded-3xl md:border md:border-line md:bg-surface md:px-8 md:pb-10 md:pt-8 md:shadow-[0_18px_40px_-28px_rgba(15,34,51,0.45)]">
      {/* mt-8 у ленты снимаем на ПК: там сверху уже есть поле самой плашки. */}
      <DotsRail as="ol" count={steps.length} className="md:mt-0 md:grid-cols-3">
        {steps.map((s, i) => (
          <RailItem as="li" key={s.title} className="relative">
            {/* Пунктир между колонками: висит в зазоре сетки (левый край
                колонки минус половина своей ширины) на высоте середины
                иллюстрации. На телефоне колонок нет — пунктира тоже. */}
            {i > 0 && (
              <span
                aria-hidden
                className="absolute left-0 top-[9.5rem] hidden w-6 -translate-x-1/2 border-t-2 border-dashed border-primary/25 md:block"
              />
            )}
            {/* На телефоне шаг — закрытая карточка, на ПК рамка не нужна:
                колонки живут внутри общей плашки. */}
            <div className="h-full rounded-3xl border border-line bg-surface p-5 shadow-[0_18px_36px_-26px_rgba(15,34,51,0.55)] md:rounded-none md:border-0 md:p-0 md:shadow-none">
              <span
                aria-hidden
                className="flex h-11 w-11 items-center justify-center rounded-full border border-primary/15 bg-surface-2 text-lg font-bold text-primary ring-8 ring-primary/5"
              >
                {i + 1}
              </span>
              {/* Иллюстрации разной формы (две вертикальные, третья широкая),
                  поэтому вписываем их в общий по высоте бокс и прижимаем к его
                  низу: так фигуры стоят на одной линии, как в макете. */}
              <div className="relative mt-5 h-32 w-full md:h-44">
                <Image
                  src={s.image}
                  alt=""
                  aria-hidden
                  fill
                  sizes="(min-width: 768px) 240px, 280px"
                  // Качество выше обычного не ради деталей, а ради фона:
                  // при 75 белый фон иллюстрации пережимается в 252 и на белой
                  // плашке видно светло-серый прямоугольник вокруг фигурки.
                  quality={90}
                  className="object-contain object-bottom"
                />
              </div>
              <h3 className="mt-5 text-center text-lg font-bold">{s.title}</h3>
              <p className="mt-2 text-center text-sm text-muted">{s.text}</p>
            </div>
          </RailItem>
        ))}
      </DotsRail>
    </div>
  );
}
