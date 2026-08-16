import type { Metadata } from "next";
import { Container, Section, Badge, Button } from "@/components/ui";
import { Squiggle } from "@/components/Squiggle";
import { Marquee } from "@/components/Marquee";
import { PriceRow } from "@/components/PriceRow";
import { BookBtn } from "@/components/BookBtn";
import { StickyBookBar } from "@/components/StickyBookBar";
import { JsonLd } from "@/components/JsonLd";
import { priceListSchema } from "@/lib/schema";
import {
  CATEGORY_LABELS,
  formatVnd,
  formatDuration,
  type ServiceCategory,
} from "@/content/services";
import { getActiveServices, getSiteServices, pickService } from "@/lib/services";
import {
  IconFoil,
  IconTandem,
  IconWaves,
  IconClub,
  IconPalm,
  IconPlay,
  IconDrone,
  IconClock,
  IconCheck,
  IconArrowRight,
} from "@/components/icons";

export const metadata: Metadata = { title: "Прайс" };
export const dynamic = "force-static"; // статичная страница, форсим SSG

// Порядок групп в прайсе: сначала то, с чего начинают, потом клубное и допы.
const ORDER: ServiceCategory[] = ["training", "tandem", "rental", "subscription", "tour", "extra"];

// Иконка к заголовку группы — чтобы страница читалась как остальной сайт, а не
// как выгрузка из таблицы.
const GROUP_ICON = {
  training: IconFoil,
  tandem: IconTandem,
  rental: IconWaves,
  subscription: IconClub,
  tour: IconPalm,
  extra: IconPlay,
} as const;

// Прайс собран тем же языком, что остальные страницы: компактная шапка,
// бегущая строка и группы услуг карточками. Полноэкранного кадра тут нарочно
// нет — на эту страницу приходят за цифрой, а не за впечатлением.
//
// Главное отличие от прежней таблицы: строка прайса — это кнопка. Тап по ней
// открывает форму записи уже с выбранной услугой.
export default async function PricesPage() {
  // Цены и тексты — из базы поверх контента; настоящие id — для формы записи.
  const [services, site] = await Promise.all([getActiveServices(), getSiteServices()]);
  const dbId = (name: string) => services.find((x) => x.name === name)?.id;

  const drone = pickService(site, "drone");

  const marquee = [
    "Оплата на месте",
    "Снаряжение включено",
    "Инструктор на связи",
    "Дети с 8 лет",
    "Нячанг · Marina Beach",
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
      {/* Прайс для поисковиков: те же услуги и те же цены, что в списке ниже —
          и то и другое берётся из базы, разъехаться не может. */}
      <JsonLd data={priceListSchema(site)} />

      {/* ── Шапка ── */}
      <Section pad="tight" className="bg-gradient-to-b from-white to-surface-2 pt-10 sm:pt-14">
        <Container>
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">Прайс</p>
          <h1 className="mt-3 text-3xl font-bold leading-tight sm:text-4xl">Стоимость услуг</h1>
          <Squiggle long className="mt-4" />
          <p className="mt-5 max-w-xl text-muted">
            Все цены в донгах (₫), оплата на месте. Снаряжение, жилет и связь на
            воде входят в стоимость занятия — доплачивать за них не нужно.
          </p>
        </Container>
      </Section>

      <Marquee items={marquee} />

      {/* ── Группы услуг ── */}
      <Section pad="tight" className="bg-gradient-to-b from-surface-2 to-white">
        <Container>
          {/* Колонки, а не сетка: групп шесть и все разной длины (в обучении
              четыре строки, в прокате одна). В сетке короткие карточки
              оставляли под собой дыры до высоты соседней, а колонки набираются
              подряд и сами выравниваются по высоте. */}
          <div className="md:columns-2 md:gap-6">
            {ORDER.map((cat) => {
              const items = site.filter((s) => s.category === cat);
              if (items.length === 0) return null;
              const Icon = GROUP_ICON[cat];
              return (
                <div
                  key={cat}
                  className="mb-6 overflow-hidden rounded-3xl border border-line bg-surface shadow-[0_18px_40px_-30px_rgba(15,34,51,0.5)] md:break-inside-avoid"
                >
                  <h2 className="flex items-center gap-2.5 border-b border-line px-4 py-3.5 text-sm font-bold uppercase tracking-wide text-primary sm:px-5">
                    <Icon aria-hidden className="h-5 w-5 shrink-0" />
                    {CATEGORY_LABELS[cat]}
                  </h2>
                  <div className="divide-y divide-line">
                    {items.map((s) => (
                      <PriceRow
                        key={s.id}
                        name={s.name}
                        // У фото/видео длительности нет — «—» под названием
                        // выглядело браком вёрстки, поэтому такую строку
                        // собираем только из того, что реально есть.
                        meta={[
                          formatDuration(s) === "—" ? null : formatDuration(s),
                          s.note,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                        price={s.price}
                        code={s.id}
                        serviceId={dbId(s.name)}
                        badge={
                          s.membersOnly ? (
                            <Badge className="ml-2 align-middle">
                              По одобрению инструктора
                            </Badge>
                          ) : undefined
                        }
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Container>
      </Section>

      {/* ── Съёмка с дрона ── */}
      {/* Услуга новая, поэтому кроме строки в прайсе ей дан отдельный блок:
          «съёмка с дрона» ничего не говорит, пока не объяснить, что дрон идёт
          над водой следом за вами и что записи остаются у вас. */}
      <Section pad="tight" className="bg-white">
        <Container>
          <div className="overflow-hidden rounded-3xl border-2 border-primary bg-gradient-to-br from-surface via-surface to-surface-2 p-6 shadow-[0_24px_50px_-30px_rgba(15,34,51,0.5)] sm:p-8">
            <div className="lg:flex lg:items-center lg:gap-10">
              <div className="lg:flex-1">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
                  >
                    <IconDrone className="h-6 w-6" />
                  </span>
                  <Badge>Новое</Badge>
                </div>
                <h2 className="mt-4 text-2xl font-bold leading-tight sm:text-3xl">{drone.name}</h2>
                <p className="mt-3 max-w-xl text-muted">
                  Дрон Hover Aqua Pro идёт над водой следом за вами и снимает
                  полёт со стороны — так, как со своей доски вы себя никогда не
                  увидите. Одна сессия длится {drone.durationMin} минут, все
                  исходники отдаём вам без обработки: монтируйте как хотите.
                </p>

                <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-3">
                  {droneFacts.map((f) => (
                    <li key={f.label} className="flex items-center gap-2 text-sm font-semibold">
                      <f.icon aria-hidden className="h-5 w-5 shrink-0 text-primary" />
                      {f.label}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Цена и кнопка отдельным столбцом: на ПК стоят справа, на
                  телефоне — под текстом во всю ширину. */}
              <div className="mt-7 shrink-0 border-t border-line pt-6 lg:mt-0 lg:w-56 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
                <p className="text-sm text-muted">Стоимость сессии</p>
                <p className="mt-1 text-3xl font-bold text-primary">{formatVnd(drone.price)}</p>
                <div className="mt-5">
                  <BookBtn
                    serviceId={dbId(drone.name)}
                    place="prices-drone"
                    size="lg"
                    className="w-full"
                  >
                    Заказать съёмку
                  </BookBtn>
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
                "Экскурсия и сафари — по одобрению инструктора: нужен опыт уверенного катания, абонемент для них не обязателен.",
                "Абонемент выгоднее разового проката: окупается уже с пятой каталки.",
                "Минуты абонемента действуют 3 месяца и списываются по факту катания.",
                "Первый абонемент необученного гостя включает обучающее занятие с инструктором.",
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
