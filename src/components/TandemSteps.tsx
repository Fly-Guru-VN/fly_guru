import Image from "next/image";
import { FoilVideo } from "./FoilVideo";

export type TandemStep = {
  title: string;
  text: string;
  // Иллюстрация шага (синяя графика на белом), обрезанная в край фигуры.
  image: string;
  // Последний шаг: номер другого цвета и с живым свечением — как «Взлетаем» на
  // странице обучения.
  highlight?: boolean;
};

// Ролик тандема (вертикальный, из инстаграма): без звука, зациклен, по клику
// разворачивается на весь экран — как ролик сборки фойла в магазине.
const CLIP = "/media/video/tandem-ride.mp4";
const CLIP_POSTER = "/media/video/tandem-ride-poster.jpg";

// «Как проходит тандем» по макету `photo_video/Тандем/ref_2.jpg`: слева шаги
// лежачими карточками (иллюстрация в круге, рядом текст) с дорожкой номеров
// сбоку, справа — вертикальный ролик в бирюзовой рамке, той же, что у ролика на
// странице обучения.
//
// Дорожка номеров устроена как на «Обучении»: линия идёт сквозь весь список, а
// кружки лежат поверх неё и закрывают её собой — считать отрезки от кружка до
// кружка нельзя, карточки разной высоты. У первого шага линия начинается от
// центра кружка, у последнего там же обрывается.
//
// На телефоне дорожки нет (на 330 px она съела бы восьмую часть ширины), кружок
// с номером сидит верхом на верхней границе своей карточки — тем же приёмом,
// что и шаги обучения.
export function TandemSteps({ steps }: { steps: TandemStep[] }) {
  return (
    <div className="md:flex md:items-center md:gap-8 lg:gap-12">
      <ol className="relative md:flex-1">
        {steps.map((s, i) => {
          const first = i === 0;
          const last = i === steps.length - 1;
          return (
            // Зазор на ПК симметричный (py-3), а не отступом снизу: так середина
            // элемента списка совпадает с серединой карточки, и кружок, который
            // центрируется по элементу, встаёт ровно по центру своей плашки.
            <li key={s.title} className="relative pb-5 pt-7 md:py-3 md:pl-16">
              <span
                aria-hidden
                className={`absolute left-[1.53rem] hidden w-0.5 bg-primary/20 md:block ${
                  first ? "top-1/2" : "top-0"
                } ${last ? "bottom-1/2" : "bottom-0"}`}
              />

              {/* ring — бледный ореол вокруг кружка: без него он выглядит на
                  светлом фоне наклейкой. */}
              <span
                aria-hidden
                className={`absolute left-1/2 top-7 z-10 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 bg-surface text-lg font-bold ring-8 md:left-1 md:top-1/2 md:translate-x-0 ${
                  s.highlight
                    ? "animate-step-glow border-accent text-accent ring-accent/5"
                    : "border-primary/35 text-primary ring-primary/5"
                }`}
              >
                {i + 1}
              </span>

              {/* Верхнее поле на телефоне больше остальных: под кружком должно
                  остаться место, иначе он ложится на заголовок. */}
              <div className="flex items-center gap-4 rounded-3xl border border-line bg-surface px-4 pb-5 pt-8 shadow-[0_18px_36px_-26px_rgba(15,34,51,0.55)] sm:px-5 md:gap-6 md:py-5">
                {/* Иллюстрации разной формы (две вертикальные, третья широкая),
                    поэтому вписываем их в общий круг: так все три занимают одно
                    место и стоят по одной линии, как в макете. */}
                <span
                  aria-hidden
                  className="grid h-[4.5rem] w-[4.5rem] shrink-0 place-items-center rounded-full bg-surface-2 sm:h-24 sm:w-24 md:h-28 md:w-28"
                >
                  <Image
                    src={s.image}
                    alt=""
                    width={560}
                    height={560}
                    sizes="112px"
                    // Качество выше обычного не ради деталей, а ради фона: при 75
                    // белый фон иллюстрации пережимается в 252 и на светлой
                    // подложке видно серый прямоугольник вокруг фигурки.
                    quality={90}
                    className="h-[78%] w-[78%] object-contain mix-blend-multiply"
                  />
                </span>
                <div className="min-w-0">
                  <h3 className="text-base font-bold leading-tight sm:text-lg">{s.title}</h3>
                  <p className="mt-2 text-sm text-muted">{s.text}</p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {/* Ролик в бирюзовой рамке — такой же, как у ролика на странице обучения.
          Кадр показываем целиком, своим форматом 9:16 и без растягивания на всю
          высоту шагов: в ролик вшиты подписи, и object-cover срезал бы у них
          края. Поэтому столбец фиксированной ширины и по центру высоты.
          На телефоне — узкой колонкой по центру: во всю ширину вертикальный кадр
          занял бы почти весь экран. */}
      <div className="mx-auto mt-8 w-[72%] max-w-[280px] rounded-[1.75rem] border-2 border-primary/30 bg-surface p-3 shadow-[0_18px_40px_-30px_rgba(15,34,51,0.5)] md:mt-0 md:w-[300px] md:max-w-none md:shrink-0 lg:w-[340px]">
        <FoilVideo
          src={CLIP}
          poster={CLIP_POSTER}
          alt="Полёт в тандеме с инструктором в Нячанге"
          shape="aspect-[9/16] rounded-[1.15rem]"
        />
      </div>
    </div>
  );
}
