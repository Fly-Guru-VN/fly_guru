import type { ComponentType, SVGProps } from "react";
import Image from "next/image";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

export type Step = {
  icon: Icon;
  title: string;
  // Приписка справа от «Шаг N» — сколько это длится или чем заканчивается.
  meta: string;
  text: string;
  image: string;
  // Куда смещать кадр при обрезке в полосу на телефоне: иллюстрации
  // вертикальные, и «по центру» у каждой попадает в своё место.
  imagePosition?: string;
  // Три коротких факта в подвале карточки. Второй строкой (label2) — перенос,
  // чтобы подписи не расползались по ширине и подвал держал одну высоту.
  facts: { icon: Icon; label: string; label2?: string }[];
};

// Ширина колонки под подпись — около 80 px (треть карточки минус иконка и
// поля). Считаем по самой длинной строке: до 12 знаков влезает основным
// кеглем, дальше мельчим на шаг.
function factSize(fact: Step["facts"][number]) {
  const longest = Math.max(fact.label.length, fact.label2?.length ?? 0);
  if (longest > 13) return "text-[9px]";
  if (longest > 11) return "text-[10px]";
  return "text-[11px]";
}

// Карточка шага на главной. Собрана по макету: оранжевый кружок с иконкой и
// подпись «ШАГ N», под ними название и текст, справа — иллюстрация, внизу —
// полоска с тремя фактами.
//
// Иллюстрация ведёт себя по-разному: на большом экране (от 1024) она вписана в
// правую половину карточки, как в макете, а текст ужат отступом справа. Ниже
// 1024 карточка втрое уже, ужимать текст там некуда — иначе в строке остаётся
// два слова, — поэтому кадр уходит полосой наверх карточки.
export function StepCard({ step, index }: { step: Step; index: number }) {
  return (
    <li className="flex flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-[0_18px_40px_-28px_rgba(15,34,51,0.45)]">
      <div className="relative flex-1">
        <div className="relative h-48 w-full bg-gradient-to-b from-white to-surface-2/60 lg:absolute lg:inset-y-0 lg:right-0 lg:h-auto lg:w-[47%] lg:bg-none">
          <Image
            src={step.image}
            alt=""
            aria-hidden
            fill
            sizes="(min-width: 1024px) 220px, 100vw"
            className={`object-cover lg:object-contain lg:object-bottom ${step.imagePosition ?? ""}`}
          />
          {/* Растушёвка краёв. Фон у иллюстраций не белый, а бледно-голубой, и
              на белой карточке он читался прямоугольной заплаткой. Гасим левый
              и верхний край в белый — картинка «растворяется» в карточке. */}
          <span
            aria-hidden
            className="absolute inset-0 hidden bg-[linear-gradient(to_right,#fff_0%,rgba(255,255,255,0.8)_16%,transparent_46%)] lg:block"
          />
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 hidden h-24 bg-gradient-to-b from-white to-transparent lg:block"
          />
        </div>
        <div className="relative p-6">
          {/* Шапка идёт во всю ширину карточки, а не по колонке текста: иначе
              длинная приписка вроде «у 90% — с первого раза» ломалась на три
              строки и заголовки в ряду вставали на разной высоте. Иллюстрация
              прижата к низу, сверху под шапкой у неё пусто. */}
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-white shadow-[0_8px_18px_-8px_rgba(255,122,26,0.9)]"
            >
              <step.icon className="h-6 w-6" />
            </span>
            <p className="text-sm font-extrabold uppercase tracking-wide text-accent-strong">
              Шаг {index + 1} · {step.meta}
            </p>
          </div>
          <div className="lg:pr-[42%]">
            <h3 className="mt-6 text-xl font-bold">{step.title}</h3>
            <p className="mt-2 text-muted">{step.text}</p>
          </div>
        </div>
      </div>
      {/* Высота полоски задана жёстко (h-20), а не по содержимому: у карточек
          разное число строк в подписях, и без этого полоски в трёх карточках
          вставали на разной высоте и ряд «плыл». */}
      <div className="grid h-20 grid-cols-3 border-t border-line bg-surface-2/50">
        {step.facts.map((f, i) => (
          <div
            key={f.label}
            className={`flex items-center gap-1.5 px-1.5 md:max-lg:flex-col md:max-lg:items-start md:max-lg:justify-center md:max-lg:gap-0.5 ${
              i > 0 ? "border-l border-line" : ""
            }`}
          >
            <f.icon aria-hidden className="h-4 w-4 shrink-0 text-primary" />
            {/* Подпись — строго в две строки: перенос ставим сами (label2), а
                внутри строки перенос запрещён. Длинную строку не ломаем на
                третью, а мельчим шрифт — так все девять подписей в ряду
                выглядят одинаково ровно. */}
            <span
              className={`font-semibold leading-tight text-ink/85 lg:whitespace-nowrap ${factSize(f)}`}
            >
              {f.label}
              {f.label2 && (
                <>
                  <br />
                  {f.label2}
                </>
              )}
            </span>
          </div>
        ))}
      </div>
    </li>
  );
}
