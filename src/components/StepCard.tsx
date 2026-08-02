import type { ComponentType, SVGProps } from "react";
import Image from "next/image";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

export type Step = {
  icon: Icon;
  title: string;
  // Приписка справа от «Шаг N» — сколько это длится или чем заканчивается.
  meta: string;
  text: string;
  // Иллюстрация для ПК: вертикальная, стоит в правой половине карточки.
  image: string;
  // Кадр для узких экранов: снят специально в 4:3, чтобы лечь во всю ширину
  // карточки без полей и обрезки (см. ниже).
  imageMobile: string;
  // Три коротких факта в подвале карточки. Второй строкой (label2) — перенос,
  // чтобы подписи не расползались по ширине и подвал держал одну высоту.
  facts: { icon: Icon; label: string; label2?: string }[];
};

// Карточка шага на главной. Собрана по макету: оранжевый кружок с иконкой и
// подпись «ШАГ N», под ними название и текст, справа — иллюстрация, внизу —
// полоска с тремя фактами.
//
// Кадр в карточке — РАЗНЫЙ на узком и широком экране, и это два разных файла:
//
//  • до 1024 карточка идёт во всю ширину экрана, и сверху лежит фото, снятое
//    специально в 4:3 (imageMobile). Оно заполняет рамку от края до края —
//    object-cover без полей и без растушёвки. Раньше здесь стояла вертикальная
//    ПК-иллюстрация: object-cover резал ей головы, а object-contain оставлял
//    белые поля по бокам. Родная пропорция снимает обе проблемы;
//  • от 1024 карточка втрое уже, кадр уходит в правую половину, как в макете, а
//    текст ужат отступом справа. Там остаётся вертикальная иллюстрация (image),
//    вписанная целиком, с растушёвкой краёв: фон у неё бледно-голубой и без
//    растушёвки читался на белой карточке прямоугольной заплаткой.
// Карточка рендерится обычным div: элемент списка (<li>) снаружи рисует
// RailItem — карточки лежат в ленте, которую на телефоне листают пальцем.
// h-full — чтобы в ряду и в ленте все три держали одну высоту.
export function StepCard({ step, index }: { step: Step; index: number }) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-line bg-surface shadow-[0_18px_40px_-28px_rgba(15,34,51,0.45)]">
      <div className="relative flex-1">
        {/* Узкий экран: фото 4:3 во всю ширину карточки. */}
        <div className="relative aspect-[4/3] w-full bg-white lg:hidden">
          <Image
            src={step.imageMobile}
            alt=""
            aria-hidden
            fill
            sizes="(min-width: 768px) 33vw, 100vw"
            className="object-cover object-center"
          />
        </div>
        {/* ПК: иллюстрация в правой половине. */}
        <div className="absolute inset-y-0 right-0 hidden w-[47%] bg-white lg:block">
          <Image
            src={step.image}
            alt=""
            aria-hidden
            fill
            sizes="220px"
            className="object-contain object-bottom"
          />
          <span
            aria-hidden
            className="absolute inset-0 bg-[linear-gradient(to_right,#fff_0%,rgba(255,255,255,0.8)_16%,transparent_46%)]"
          />
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white to-transparent"
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
            className={`flex flex-col items-center justify-center gap-1 px-1.5 text-center ${
              i > 0 ? "border-l border-line" : ""
            }`}
          >
            <f.icon aria-hidden className="h-5 w-5 shrink-0 text-primary" />
            {/* Подпись — строго в две строки: перенос ставим сами (label2), а
                внутри строки перенос запрещён.
                Кегль ОДИН у всех девяти подписей — 12 px, и на телефоне, и на
                ПК. Раньше на ПК он плавал от 9 до 11 px в зависимости от длины
                строки: подписи выходили разного размера и мелкими. Плавать
                приходилось потому, что иконка и текст стояли в ряд и на текст
                оставалась треть плашки. Теперь на ПК иконка тоже стоит НАД
                текстом — плашка отдаёт подписи всю ширину, и 12 px влезают.
                Исключение одно — планшет: там три карточки в ряд на 768 px,
                плашка вдвое уже, и подпись ужимается до 10 px. */}
            <span
              className="text-xs font-semibold leading-tight text-ink/85 md:max-lg:text-[10px] lg:whitespace-nowrap"
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
    </div>
  );
}
