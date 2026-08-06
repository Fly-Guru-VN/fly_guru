import type { Metadata } from "next";
import Image from "next/image";
import { Container, Section, buttonClasses } from "@/components/ui";
import { Squiggle } from "@/components/Squiggle";
import { BookBtn } from "@/components/BookBtn";
import { StickyBookBar } from "@/components/StickyBookBar";
import { TandemSteps, type TandemStep } from "@/components/TandemSteps";
import {
  IconClock,
  IconPeople,
  IconCheck,
  IconShield,
  IconSmile,
  IconArrowRight,
} from "@/components/icons";
import { getActiveServices } from "@/lib/services";

export const metadata: Metadata = { title: "Тандем" };
export const dynamic = "force-static"; // статичная страница, форсим SSG

// Ролик «как это проходит» лежит в инстаграме — отдельной страницы под него нет.
const HOW_IT_GOES_URL = "https://www.instagram.com/p/DaQFF53P3Nb/";

// Страница тандема собрана по макету `photo_video/Тандем/ref.png`: всего два
// экрана — кадр полёта с текстом и три шага «как это проходит». Больше на
// странице ничего нет намеренно: тандем покупают глазами, а не сравнением
// вариантов (цены и форматы живут на /prices и /training).
export default async function TandemPage() {
  // Услуги тандема из базы (с настоящими id) — для формы записи. Заранее
  // выбираем взрослый тандем: детский в форме выбирается из того же списка.
  const services = await getActiveServices("tandem");
  const defaultServiceId =
    services.find((s) => s.code === "tandem-adult")?.id ?? services[0]?.id;

  // Условия проката — плашками под текстом: их ищут глазами первыми.
  const facts = [
    { icon: IconClock, value: "10 минут", label: "длительность" },
    { icon: IconPeople, value: "от 8 лет", label: "доступ" },
    { icon: IconCheck, value: "не требуется", label: "обучение" },
  ];

  // Два обещания — снимают главные страхи: «а это безопасно?» и «а я вообще
  // смогу?». На ПК висят плашками поверх кадра, на телефоне — короткими
  // плашками над заголовком (там от них остаются только названия).
  const promises = [
    {
      icon: IconShield,
      title: "Безопасно",
      text: "Инструктор с вами на протяжении всего полёта.",
    },
    {
      icon: IconSmile,
      title: "Лёгкий старт",
      text: "Не нужно уметь кататься — мы всё сделаем за вас.",
    },
  ];

  const steps: TandemStep[] = [
    {
      title: "Одеваем экипировку",
      text: "На берегу вам выдают всю необходимую экипировку и готовят к полёту.",
      image: "/media/photo/tandem-step-1.webp",
    },
    {
      title: "Тандем",
      text: "Инструктор управляет фойлом, вы наслаждаетесь. Ничего сложного, никаких ограничений.",
      image: "/media/photo/tandem-step-2.webp",
    },
    {
      title: "Эмоции на высоте",
      text: "Яркие впечатления обеспечены.",
      image: "/media/photo/tandem-step-3.webp",
      // Оранжевый пульсирующий номер, как у последнего шага обучения.
      highlight: true,
    },
  ];

  return (
    <>
      {/* ── Первый экран ── */}
      {/* Фон уходит из морского в белый — дальше страница продолжается тем же
          белым, без ступеньки на стыке блоков. */}
      <section className="relative overflow-hidden bg-gradient-to-b from-surface-2 to-white">
        {/* Чайки — как в блоках главной: только от md, на телефоне декор
            съедал бы место. Пара висит слева от заголовка, как в макете. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 hidden md:block">
          <Image
            src="/media/decor/bird.webp"
            alt=""
            width={320}
            height={117}
            className="absolute left-6 top-24 w-14 -rotate-[7deg] opacity-90"
          />
          <Image
            src="/media/decor/bird.webp"
            alt=""
            width={320}
            height={117}
            className="absolute left-2 top-56 w-[4.5rem] rotate-[5deg]"
          />
        </div>

        {/* Кадр. У файла уже зашиты скруглённый левый край и волна снизу —
            подложки и масок ему не нужно, прозрачные края показывают фон
            страницы.
            До lg кадр идёт полосой сверху во всю ширину, а текст под ним: рядом
            с текстом на планшете он оставлял абзацу 330 px.
            От lg — справа, до самого края окна, как в макете, и прижат к верху
            секции (items-start): по центру между шапкой и кадром зияла полоса.
            На узком экране кадр сдвинут влево на свою прозрачную полосу
            (12.6% ширины файла — измерено по альфе): иначе слева зияла бы
            пустая проплешина. Второго файла под телефон не делаем — кадр
            первого экрана грузится всегда, и это лишние 160 КБ запроса. */}
        <div className="lg:absolute lg:inset-y-0 lg:right-0 lg:flex lg:w-[56%] lg:items-start">
          <div className="relative -ml-[14.4%] w-[114.4%] lg:ml-0 lg:w-full">
            <Image
              src="/media/photo/tandem-hero-2.webp"
              alt="Гостья и инструктор летят вдвоём на одном электрофойле над морем"
              width={1669}
              height={942}
              priority
              quality={90}
              sizes="(min-width: 1024px) 60vw, 115vw"
              className="h-auto w-full"
            />
            {/* Плашки поверх кадра — только на ПК: на телефоне они идут ниже,
                обычными карточками под текстом. Проценты считаются от самого
                кадра, поэтому плашки и лежат внутри его обёртки. */}
            <div className="pointer-events-none absolute inset-0 hidden lg:block">
              {promises.map((p, i) => (
                <div
                  key={p.title}
                  className={`absolute right-5 w-56 rounded-2xl border border-white/60 bg-white/85 p-4 shadow-[0_18px_40px_-24px_rgba(15,34,51,0.45)] backdrop-blur-sm ${
                    i === 0 ? "top-[24%]" : "top-[50%]"
                  }`}
                >
                  <p className="flex items-center gap-2 font-bold">
                    <p.icon aria-hidden className="h-5 w-5 shrink-0 text-primary" />
                    {p.title}
                  </p>
                  <p className="mt-1.5 text-sm leading-snug text-muted">{p.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <Container className="relative">
          <div className="pb-12 pt-8 lg:max-w-[46%] lg:pb-8 lg:pt-16">
            {/* Надпись «Тандем» над заголовком остаётся только на большом
                экране. Ниже lg вместо неё — те же два обещания, что на ПК висят
                поверх кадра, но короткими плашками в ряд: без них первый экран
                телефона обходился совсем без ответа на «а это безопасно?».
                flex-wrap — страховка на узких телефонах: не влезут в строку,
                встанут друг под другом. */}
            <p className="hidden text-sm font-semibold uppercase tracking-wide text-primary lg:block">
              Тандем
            </p>
            <ul className="flex flex-wrap gap-2 lg:hidden">
              {promises.map((p) => (
                <li
                  key={p.title}
                  className="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 shadow-[0_10px_24px_-20px_rgba(15,34,51,0.6)]"
                >
                  <p.icon aria-hidden className="h-4 w-4 shrink-0 text-primary" />
                  <span className="text-sm font-semibold">{p.title}</span>
                </li>
              ))}
            </ul>
            <Squiggle className="mt-3" />
            <h1 className="mt-5 text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl">
              Полёт в тандеме
            </h1>
            <p className="mt-3 text-lg text-muted sm:text-xl">
              Лёгкий, весёлый и безопасный прокат
            </p>
            <p className="mt-5 max-w-xl text-muted">
              Тандем — это самый простой способ ощутить полёт на электрофойле. Инструктор
              подбирает вас с пирса, и в следующее мгновение вы наслаждаетесь ощущением
              свободы и полёта над водой. Обучение не требуется.
            </p>

            <ul className="mt-8 flex flex-wrap gap-x-7 gap-y-4">
              {facts.map((f) => (
                <li key={f.label} className="flex items-center gap-2.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-primary">
                    <f.icon aria-hidden className="h-5 w-5" />
                  </span>
                  {/* Подпись сверху, значение под ней: сначала читается «о чём
                      речь» (длительность, доступ), потом сама цифра. */}
                  <span>
                    <span className="block text-xs text-muted">{f.label}</span>
                    <span className="block text-sm font-bold leading-tight">{f.value}</span>
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <BookBtn
                serviceId={defaultServiceId}
                place="tandem-hero"
                size="lg"
                className="w-full sm:w-auto"
              >
                Записаться на тандем
              </BookBtn>
              {/* Ролик лежит в инстаграме, поэтому обычная ссылка, а не Link:
                  локали и внутренний роутинг тут не при чём. */}
              <a
                href={HOW_IT_GOES_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClasses({ variant: "ghost", size: "lg" })}
              >
                Как это проходит <IconArrowRight className="h-4 w-4" />
              </a>
            </div>

          </div>
        </Container>
      </section>

      {/* ── Как проходит тандем ── */}
      <Section pad="tight" className="relative overflow-hidden bg-gradient-to-b from-white to-surface-2">
        {/* Чайки из макета `ref_2.jpg` — пара над роликом, в пустоте справа от
            заголовка. Только от md: на телефоне ролик начинается сразу под
            заголовком и садиться им негде. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 hidden md:block">
          <Image
            src="/media/decor/bird.webp"
            alt=""
            width={320}
            height={117}
            className="absolute right-[22%] top-4 w-16 -rotate-[6deg] opacity-90"
          />
          <Image
            src="/media/decor/bird.webp"
            alt=""
            width={320}
            height={117}
            className="absolute right-4 top-12 w-12 rotate-[4deg] opacity-80"
          />
        </div>

        <Container className="relative">
          <h2 className="text-3xl font-bold sm:text-4xl">Как проходит тандем</h2>
          <Squiggle long className="mt-4" />
          <div className="mt-6 md:mt-8">
            <TandemSteps steps={steps} />
          </div>
        </Container>
      </Section>

      <StickyBookBar serviceId={defaultServiceId} label="Записаться на тандем" />
    </>
  );
}
