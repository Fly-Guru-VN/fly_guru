import Image from "next/image";
import { DotsRail } from "./DotsRail";
import { RailItem } from "./Rail";
import { FoilVideo } from "./FoilVideo";

export type TandemStep = {
  title: string;
  text: string;
  // Иллюстрация шага (синяя графика на белом), обрезанная в край фигуры.
  image: string;
};

// Ролик тандема (вертикальный, из инстаграма): без звука, зациклен, по клику
// разворачивается на весь экран — как ролик сборки фойла в магазине.
const CLIP = "/media/video/tandem-ride.mp4";
const CLIP_POSTER = "/media/video/tandem-ride-poster.jpg";

// Место шага в сетке на большом экране: первый и второй столбиком слева,
// третий — правее и по центру их высоты (self-center + строка на две).
// Только от lg: на планшете шаги стоят прежним рядом из трёх.
const PLACE = [
  "lg:col-start-1 lg:row-start-1",
  "lg:col-start-1 lg:row-start-2",
  "lg:col-start-2 lg:row-span-2 lg:self-center",
];

// «Как проходит тандем»: слева белая плашка с шагами, справа вертикальный ролик.
//
// Три вида:
//  • большой экран (от lg) — шаги 1 и 2 столбиком, шаг 3 правее по центру,
//    ролик крайним столбцом;
//  • планшет (md) — прежний ряд из трёх шагов, ролик под плашкой: рядом с ним
//    колонки шагов ужимались до 200 px и заголовки ломались пополам;
//  • телефон — лента с точками (как отзывы и шаги на главной), ролик под ней:
//    три высокие карточки одна под другой заняли бы почти три экрана прокрутки.
export function TandemSteps({ steps }: { steps: TandemStep[] }) {
  return (
    <div className="lg:flex lg:items-stretch lg:gap-8">
      <div className="md:rounded-3xl md:border md:border-line md:bg-surface md:px-8 md:pb-10 md:pt-8 md:shadow-[0_18px_40px_-28px_rgba(15,34,51,0.45)] lg:flex-1">
        {/* mt-8 у ленты снимаем на ПК: там сверху уже есть поле самой плашки. */}
        <DotsRail
          as="ol"
          count={steps.length}
          className="md:mt-0 md:grid-cols-3 lg:grid-cols-2 lg:gap-x-10 lg:gap-y-8"
        >
          {steps.map((s, i) => (
            <RailItem as="li" key={s.title} className={`relative ${PLACE[i]}`}>
              {/* Пунктир между колонками ряда — только на планшете: на большом
                  экране шаги стоят уступом, и соединять там нечего. Висит в
                  зазоре сетки (левый край колонки минус половина своей ширины)
                  на высоте середины иллюстрации. */}
              {i > 0 && (
                <span
                  aria-hidden
                  className="absolute left-0 top-[9rem] hidden w-6 -translate-x-1/2 border-t-2 border-dashed border-primary/25 md:block lg:hidden"
                />
              )}
              {/* На телефоне шаг — закрытая карточка, на ПК рамка не нужна:
                  шаги живут внутри общей плашки. */}
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
                <div className="relative mt-5 h-32 w-full md:h-40">
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

      {/* Ролик. Кадр показываем целиком, своим форматом 9:16 и без растягивания
          на всю высоту плашки: в ролик вшиты подписи, и object-cover срезал бы
          у них края. Поэтому столбец фиксированной ширины и по центру высоты.
          На телефоне — узкой колонкой по центру: во всю ширину вертикальный
          кадр занял бы почти весь экран. */}
      <div className="mt-8 lg:mt-0 lg:w-[340px] lg:shrink-0 lg:self-center">
        <div className="mx-auto w-[72%] max-w-[280px] md:max-w-[320px] lg:w-full lg:max-w-none">
          <FoilVideo
            src={CLIP}
            poster={CLIP_POSTER}
            alt="Полёт в тандеме с инструктором в Нячанге"
            shape="aspect-[9/16] rounded-3xl"
          />
        </div>
      </div>
    </div>
  );
}
