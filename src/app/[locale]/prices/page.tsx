import type { Metadata } from "next";
import Image from "next/image";
import { Container, Section, Badge, Button } from "@/components/ui";
import { Squiggle } from "@/components/Squiggle";
import { BookBtn } from "@/components/BookBtn";
import { StickyBookBar } from "@/components/StickyBookBar";
import { JsonLd } from "@/components/JsonLd";
import { PriceTabs, type PriceGroup } from "@/components/PriceTabs";
import { priceListSchema } from "@/lib/schema";
import {
  CATEGORY_LABELS,
  formatVnd,
  type ServiceCategory,
} from "@/content/services";
import { getActiveServices, getSiteServices, pickService } from "@/lib/services";
import {
  IconDrone,
  IconClock,
  IconCheck,
  IconArrowRight,
  IconShield,
  IconUser,
  IconTrend,
  IconSmile,
  IconVest,
} from "@/components/icons";

export const metadata: Metadata = { title: "Прайс" };
export const dynamic = "force-static"; // статичная страница, форсим SSG

// Порядок вкладок в прайсе: сначала то, с чего начинают, потом клубное и допы.
const ORDER: ServiceCategory[] = ["training", "tandem", "rental", "subscription", "tour", "extra"];

// Самый ходовой формат школы — карточка с рамкой и меткой «Популярное».
const POPULAR = "basic-adult";

// Прайс собран по макету: фигурный кадр в шапке, под ним — шесть тематических
// вкладок, и в каждой карточки только своей группы услуг.
//
// Почему вкладки, а не всё подряд. Услуг тринадцать, и списком в шесть колонок
// страница читалась как выгрузка из таблицы: человек, пришедший за ценой
// тандема, пролистывал мимо обучения, выездов и фото/видео. Теперь он тапает
// «Тандем» и видит ровно две карточки.
//
// Карточки при этом лежат в HTML ВСЕ — спрятана только неактивная вкладка
// (см. PriceTabs). Страница статическая, и поисковик получает все цены разом.
export default async function PricesPage() {
  // Цены и тексты — из базы поверх контента; настоящие id — для формы записи.
  const [services, site] = await Promise.all([getActiveServices(), getSiteServices()]);
  const dbId = (name: string) => services.find((x) => x.name === name)?.id;

  const drone = pickService(site, "drone");

  // Группы для вкладок. Пустых не бывает, но проверяем: услугу могут выключить
  // в админке, и вкладка без карточек выглядела бы поломкой.
  const groups: PriceGroup[] = ORDER.map((cat) => ({
    cat,
    label: CATEGORY_LABELS[cat],
    items: site
      .filter((s) => s.category === cat)
      .map((service) => ({
        service,
        serviceId: dbId(service.name),
        highlight: service.id === POPULAR,
      })),
  })).filter((g) => g.items.length > 0);

  // Полоска под карточками: то, что входит в любую цену из прайса. Раньше это
  // было бегущей строкой над списком — но ровно те же слова стоят в карточках
  // и в тексте шапки, и на одном экране повторялись трижды.
  const promises = [
    {
      icon: IconUser,
      title: "Инструктор на связи",
      text: "Всегда поддерживает связь через наушник",
    },
    {
      icon: IconTrend,
      title: "90% встают на крыло",
      text: "Большинство учеников осваивают доску на первом занятии",
    },
    { icon: IconSmile, title: "Детям с 8 лет", text: "Отдельные детские программы" },
    { icon: IconVest, title: "Всё включено", text: "Снаряжение, жилет, связь на воде" },
    {
      icon: IconShield,
      title: "Безопасная бухта",
      text: "Закрытая бухта без волн и течений",
    },
  ];

  // Что входит в съёмку с дрона — тремя короткими фактами, как в карточках
  // форматов на обучении.
  const droneFacts = [
    { icon: IconClock, label: `Сессия ${drone.durationMin} минут` },
    { icon: IconCheck, label: "Исходники отдаём" },
    { icon: IconDrone, label: "Съёмка с воздуха" },
  ];

  return (
    <>
      {/* Прайс для поисковиков: те же услуги и те же цены, что в карточках
          ниже — и то и другое берётся из базы, разъехаться не может. */}
      <JsonLd data={priceListSchema(site)} />

      {/* ── Первый экран ── */}
      {/* Собран ровно как первый экран тандема, под макет hero_maket_3
          (1669×942 — те же размеры, что у кадра тандема): до lg кадр идёт
          полосой во всю ширину, текст под ним; от lg кадр уходит в правый
          верхний угол окна и стоит там враспор, а текст занимает левую
          половину.

          Section тут не используется: у первого экрана свои поля — сверху
          кадр должен вставать встык под шапку. Фон градиентом в surface-2,
          чтобы стык со следующей секцией (она начинается тем же цветом) не
          читался ступенькой. */}
      {/* min-h на ПК — ровно по высоте кадра. Кадр лежит absolute, то есть
          высоту секции не задаёт; её задавал текст, а он ниже кадра — и волну
          по нижнему краю фотографии срезало overflow-hidden. 29.4vw — это и
          есть высота кадра: 52% ширины окна, делённые на пропорцию файла
          1669/942. Меняете долю кадра или файл — пересчитайте и это число. */}
      <section className="relative overflow-hidden bg-gradient-to-b from-white to-surface-2 lg:flex lg:min-h-[29.4vw] lg:items-center">
        {/* Чайки — как в блоках главной. Обе слева: правую половину экрана от
            lg занимает кадр, а ниже lg он идёт во всю ширину, и чайка легла бы
            прямо на воду. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 hidden lg:block">
          <Image
            src="/media/decor/bird.webp"
            alt=""
            width={320}
            height={117}
            className="absolute left-6 top-28 w-14 -rotate-[7deg] opacity-90"
          />
          <Image
            src="/media/decor/bird.webp"
            alt=""
            width={320}
            height={117}
            className="absolute left-2 top-52 w-[4.5rem] rotate-[5deg] opacity-80"
          />
        </div>

        {/* Кадр. У файла уже зашиты скруглённый левый край и волна снизу —
            подложки и масок ему не нужно, прозрачные края показывают фон
            страницы.
            От lg — справа, до самого края окна, и прижат к верху секции
            (items-start): по центру между шапкой и кадром зияла бы полоса.
            На узком экране кадр сдвинут влево на свою прозрачную полосу
            (4% ширины файла — измерено по альфе), иначе слева оставалась бы
            пустая проплешина. Второго файла под телефон не делаем — кадр
            первого экрана грузится всегда, и это лишний запрос. */}
        {/* 52%, а не 56% как у тандема. Кадр прижат к краю ОКНА, а текст живёт
            в контейнере, который с ростом окна отъезжает вправо быстрее, чем
            левый край кадра, — значит доля кадра решает, сойдутся они или нет.
            Условие простое: непрозрачная часть кадра должна начинаться правее
            середины окна. У тандема это выходит само собой, потому что слева у
            его файла 12.5% прозрачного поля и текст подтыкается под него; у
            макета 3 поля всего 4%, и при 56% текст лез под воду уже с 1200 px
            (проверено). При 52% зазор держится на всех ширинах. */}
        <div className="lg:absolute lg:inset-y-0 lg:right-0 lg:flex lg:w-[52%] lg:items-start">
          <div className="relative -ml-[4.2%] w-[104.2%] lg:ml-0 lg:w-full">
            <Image
              src="/media/photo/prices/hero.webp"
              alt="Электрофойл на воде в бухте Нячанга, на фоне город и горы"
              width={1669}
              height={942}
              priority
              quality={90}
              sizes="(min-width: 1024px) 60vw, 105vw"
              className="h-auto w-full"
            />
          </div>
        </div>

        <Container className="relative">
          {/* Надстрочника «Прайс» над заголовком нет: он повторял название
              раздела, которое и так подсвечено в шапке. */}
          {/* На ПК текст стоит по центру высоты кадра (items-center у секции),
              поэтому поля симметричные: с прежними pt-20/pb-16 он сидел под
              шапкой, а под ним зияла пустая половина экрана. */}
          <div className="pb-10 pt-8 lg:max-w-[46%] lg:py-12">
            <h1 className="text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl">
              Стоимость услуг
            </h1>
            <Squiggle long className="mt-4" />
            <p className="mt-5 max-w-xl text-muted">
              Все цены в донгах (₫), оплата на месте. Снаряжение, жилет и связь на
              воде входят в стоимость занятия — доплачивать за них не нужно.
            </p>
          </div>
        </Container>
      </section>

      {/* ── Вкладки с услугами ── */}
      <Section pad="tight" className="bg-gradient-to-b from-surface-2 to-white">
        <Container>
          <PriceTabs groups={groups} />

          <div className="mt-10 overflow-hidden rounded-3xl border border-line bg-surface">
            <ul className="grid sm:grid-cols-2 lg:grid-cols-5">
              {promises.map((p, i) => (
                <li
                  key={p.title}
                  // Разделители рисуем только там, где соседи реально стоят
                  // рядом: на телефоне колонка одна, и вертикальные линии
                  // висели бы в воздухе.
                  className={`flex items-start gap-2.5 border-line p-3.5 ${
                    i > 0 ? "border-t sm:border-t-0" : ""
                  } ${i % 2 === 1 ? "sm:border-l" : ""} ${
                    i >= 2 ? "sm:border-t" : ""
                  } lg:border-l lg:border-t-0 ${i === 0 ? "lg:border-l-0" : ""}`}
                >
                  <span
                    aria-hidden
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
                  >
                    <p.icon className="h-[18px] w-[18px]" />
                  </span>
                  {/* На ПК колонок пять на 1152 px — заголовок ужимаем на
                      пункт, иначе «Инструктор на связи» встаёт в две строки и
                      полоска растёт вдвое. */}
                  <span className="min-w-0">
                    <span className="block text-sm font-bold leading-tight lg:text-[13px]">
                      {p.title}
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-muted lg:text-[11px]">
                      {p.text}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </Section>

      {/* ── Съёмка с дрона ── */}
      {/* Услуга новая, поэтому кроме карточки во вкладке «Дополнительно» ей дан
          отдельный блок: «съёмка с дрона» ничего не говорит, пока не объяснить,
          что дрон идёт над водой следом за вами и что записи остаются у вас. */}
      <Section pad="tight" className="bg-white">
        <Container>
          <div className="overflow-hidden rounded-3xl border-2 border-primary bg-gradient-to-br from-surface via-surface to-surface-2 p-6 shadow-[0_24px_50px_-30px_rgba(15,34,51,0.5)] sm:p-8">
            <div className="lg:flex lg:items-center lg:gap-10">
              {/* Сам дрон — крупно. Услугу продаёт именно он: «съёмка с дрона»
                  словами ничего не говорит, а оранжевый аппарат с камерой
                  узнаётся мгновенно. Кадр не декоративный (это ровно то, что
                  полетит рядом с вами), поэтому у него настоящий alt. */}
              <div className="mx-auto max-w-[16rem] shrink-0 sm:max-w-[19rem] lg:mx-0 lg:w-[23rem] lg:max-w-none">
                <Image
                  src={drone.image ?? "/placeholders/media.svg"}
                  alt="Дрон Hover Aqua Pro в полёте над морем"
                  width={900}
                  height={900}
                  quality={90}
                  sizes="(min-width: 1024px) 368px, (min-width: 640px) 304px, 256px"
                  className="h-auto w-full"
                />
              </div>

              <div className="mt-6 lg:mt-0 lg:flex-1">
                <Badge>Новое</Badge>
                <h2 className="mt-4 text-2xl font-bold leading-tight sm:text-3xl">{drone.name}</h2>
                <p className="mt-3 max-w-xl text-muted">
                  Дрон Hover Aqua Pro идёт над водой следом за вами и снимает
                  полёт со стороны. Одна сессия длится {drone.durationMin} минут,
                  все исходники отдаём без обработки. Если потребуется
                  обработка — у нас есть услуга монтажа.
                </p>

                <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-3">
                  {droneFacts.map((f) => (
                    <li key={f.label} className="flex items-center gap-2 text-sm font-semibold">
                      <f.icon aria-hidden className="h-5 w-5 shrink-0 text-primary" />
                      {f.label}
                    </li>
                  ))}
                </ul>

                {/* Цена и кнопка полосой под текстом, а не третьим столбцом:
                    столбец рядом с крупным кадром оставлял тексту узкую
                    колонку, и абзац вставал в семь строк. */}
                <div className="mt-6 border-t border-line pt-5 sm:flex sm:items-center sm:justify-between sm:gap-6">
                  <div>
                    <p className="text-sm text-muted">Стоимость сессии</p>
                    <p className="mt-1 text-3xl font-bold text-primary">{formatVnd(drone.price)}</p>
                  </div>
                  <div className="mt-4 sm:mt-0 sm:shrink-0">
                    <BookBtn
                      serviceId={dbId(drone.name)}
                      place="prices-drone"
                      size="lg"
                      className="w-full sm:w-auto"
                    >
                      Заказать съёмку
                    </BookBtn>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </Section>

      {/* ── Приписки и переходы ── */}
      <Section pad="tight" className="bg-gradient-to-b from-white to-surface-2">
        <Container>
          <div className="rounded-3xl border border-line bg-surface p-5 sm:p-6">
            <ul className="grid gap-2.5 sm:grid-cols-2">
              {[
                "Экскурсия и сафари — по одобрению инструктора: вы должны хорошо чувствовать доску.",
                "Абонемент выгоднее разового проката.",
                "Минуты абонемента действуют 3 месяца и списываются по факту катания.",
                "Первый абонемент включает обучающее занятие с инструктором.",
              ].map((t) => (
                <li key={t} className="flex gap-2 text-sm text-muted">
                  <IconCheck aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  {t}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button href="/training" variant="secondary">
              Подробнее об обучении <IconArrowRight className="h-4 w-4" />
            </Button>
            <Button href="/club" variant="secondary">
              Про клуб и абонемент <IconArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </Container>
      </Section>

      <StickyBookBar />
    </>
  );
}
