import type { Metadata } from "next";
import { localeAlternates } from "@/lib/alternates";
import Image from "next/image";
import { Container, Section, buttonClasses } from "@/components/ui";
import { Squiggle } from "@/components/Squiggle";
import { Marquee } from "@/components/Marquee";
import { BookBtn } from "@/components/BookBtn";
import { TrackedLink } from "@/components/TrackedLink";
import { AppIcon } from "@/components/AppIcon";
import { JsonLd } from "@/components/JsonLd";
import { businessSchema, priceRangeLabel } from "@/lib/schema";
import { getSiteServices } from "@/lib/services";
import {
  IconPhone,
  IconPin,
  IconClock,
  IconChat,
  IconArrowRight,
  IconWhatsApp,
  IconMail,
} from "@/components/icons";
import { contacts, socials } from "@/content/contacts";
import { getTranslations, setRequestLocale } from "next-intl/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Contacts" });

  return {
    title: t("metaTitle"),
    alternates: localeAlternates("/contacts"),
  };
}
export const dynamic = "force-static"; // статичная страница, форсим SSG

// Страница контактов собрана по макету ref_rewie_hero (01.09.2026): на первом
// экране слева текст с кнопками, справа карта карточкой, а на карте — плашки
// мессенджеров и кнопка маршрута.
//
// Главное отличие от прежней версии: карта уехала НАВЕРХ, и отдельного блока
// «Где нас найти» внизу больше нет — адрес, часы и маршрут живут в первом
// экране. Каналов связи отдельным блоком тоже нет: они и так лежат плашками на
// карте, а ниже дублировались один в один.
//
// Ничего сверх того, что лежит в src/content/contacts.ts, страница не обещает:
// часы, адрес, каналы — оттуда, правятся в одном месте.

// Адрес соцсети «как в приложении»: имя канала человек ищет глазами быстрее,
// чем длинную ссылку. Ключ — id из списка socials, логотип лежит там же.
const SOCIAL_HANDLE: Record<string, string> = {
  instagram: "@flyguru.club",
  youtube: "@fly_guru",
  tiktok: "@denisflyguru",
  facebook: "FlyGuru",
  "telegram-channel": "@flyguru_club",
};

// Мессенджеры плашками на карте — ровно три, как в макете. Порядок по частоте:
// большая часть заявок приходит в WhatsApp.
const MESSENGERS = [
  { key: "whatsapp", app: "whatsapp", title: "WhatsApp", href: contacts.phone.whatsapp },
  { key: "telegram", app: "telegram", title: "Telegram", href: contacts.telegram },
  { key: "zalo", app: "zalo", title: "Zalo", href: contacts.zalo },
] as const;

export default async function ContactsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, tSocials, tSchema] = await Promise.all([
    getTranslations("Contacts"),
    getTranslations("Socials"),
    getTranslations("Schema"),
  ]);
  // Вилка цен для разметки — из базы, как и на главной (см. lib/schema.ts).
  const priceRange = priceRangeLabel(await getSiteServices());

  const marquee = [
    t("hours"),
    t("marqueeMessengers"),
    t("place"),
    t("marqueeFast"),
    contacts.phone.display,
  ];

  return (
    <>
      {/* Та же карточка школы, что и на главной (общий @id внутри): именно эту
          страницу поисковик считает страницей контактов организации. */}
      <JsonLd data={businessSchema(tSchema("description"), priceRange)} />

      {/* ── Первый экран ── */}
      {/* Светлая секция встык под шапку, как на отзывах: Section тут не
          используется, у первого экрана свои поля. Фон градиентом в surface-2,
          чтобы стык с бегущей строкой ниже не читался ступенькой. */}
      <section className="relative overflow-hidden bg-gradient-to-b from-white to-surface-2">
        {/* Чайки — как на отзывах и прайсе. Только слева и только от xl:
            правую половину занимает карта, а до 1280 px контейнер прижат к
            краям окна и птица садилась бы прямо на заголовок. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 hidden xl:block">
          <Image
            src="/media/decor/bird.webp"
            alt=""
            width={320}
            height={117}
            className="absolute left-6 top-20 w-14 -rotate-[7deg] opacity-90"
          />
          <Image
            src="/media/decor/bird.webp"
            alt=""
            width={320}
            height={117}
            className="absolute left-2 top-44 w-[4.5rem] rotate-[5deg] opacity-80"
          />
        </div>

        <Container className="relative">
          {/* items-stretch: обе колонки одной высоты, и низ левой части ровно
              совпадает с низом карты — так просил David 03.09.2026. Высоту
              задаёт та колонка, что выше: обычно левая с плашками. */}
          <div className="grid items-stretch gap-10 pb-12 pt-8 lg:grid-cols-2 lg:gap-12 lg:pb-16 lg:pt-12">
            {/* ── Левая колонка: кто мы и как до нас достучаться ── */}
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-primary">
                {t("eyebrow")}
              </p>
              <Squiggle className="mt-3" />
              <h1 className="mt-5 text-4xl font-bold leading-[1.05] sm:text-5xl">
                {t("title")}
              </h1>
              <p className="mt-5 max-w-md text-muted">
                {t("lead")}
              </p>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <TrackedLink
                  href={contacts.phone.whatsapp}
                  external
                  newTab
                  event="contact_click"
                  data={{ channel: "whatsapp", place: "contacts-hero" }}
                  className={buttonClasses({ size: "lg", className: "w-full sm:w-auto" })}
                >
                  <IconWhatsApp aria-hidden className="h-5 w-5" />
                  {t("writeWhatsApp")}
                </TrackedLink>
                <TrackedLink
                  href={contacts.phone.tel}
                  external
                  event="contact_click"
                  data={{ channel: "phone", place: "contacts-hero" }}
                  className={buttonClasses({
                    variant: "secondary",
                    size: "lg",
                    className: "w-full sm:w-auto",
                  })}
                >
                  <IconPhone aria-hidden className="h-5 w-5" />
                  {t("call")}
                </TrackedLink>
              </div>

              {/* Номер и почта — плашки-ССЫЛКИ: выглядят как справка, но по ним
                  жмут, поэтому они открывают звонилку и почту. */}
              <div className="mt-6 flex flex-wrap gap-3">
                <TrackedLink
                  href={contacts.phone.tel}
                  external
                  event="contact_click"
                  data={{ channel: "phone", place: "contacts-hero-chip" }}
                  className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2.5 text-sm font-semibold transition-colors hover:border-primary/40"
                >
                  <IconPhone aria-hidden className="h-4 w-4 text-primary" />
                  {contacts.phone.display}
                </TrackedLink>
                <TrackedLink
                  href={`mailto:${contacts.email}`}
                  external
                  event="contact_click"
                  data={{ channel: "email", place: "contacts-hero-chip" }}
                  className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2.5 text-sm font-semibold transition-colors hover:border-primary/40"
                >
                  <IconMail aria-hidden className="h-4 w-4 text-primary" />
                  {contacts.email}
                </TrackedLink>
              </div>

              {/* Часы и место — не ссылки, а справка: их читают глазами. */}
              <ul className="mt-3 flex flex-wrap gap-3">
                <li className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2.5 text-sm font-semibold">
                  <IconClock aria-hidden className="h-4 w-4 text-primary" />
                  {t("hours")}
                </li>
                <li className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2.5 text-sm font-semibold">
                  <IconPin aria-hidden className="h-4 w-4 text-primary" />
                  {t("place")}
                </li>
              </ul>

              {/* Мессенджеры — здесь, а не на карте. На карте они закрывали
                  собственные кнопки Google («Открыть в Картах» сверху, логотип
                  и обзор улицы снизу): дотянуться до них стилями нельзя, карта
                  идёт в окне с чужого домена, а прятать логотип запрещают
                  правила Google. Поэтому вся связь собрана слева, справа —
                  чистая карта (решение David 03.09.2026). */}
              <ul className="mt-6 grid gap-3 sm:grid-cols-3">
                {MESSENGERS.map((m) => (
                  <li key={m.key}>
                    <TrackedLink
                      href={m.href}
                      external
                      newTab
                      event="contact_click"
                      data={{ channel: m.key, place: "contacts-hero" }}
                      className="group flex h-full items-start gap-3 rounded-2xl border border-line bg-surface p-3.5 transition hover:border-primary/40 hover:shadow-[0_20px_44px_-26px_rgba(15,34,51,0.55)] active:scale-[0.99]"
                    >
                      <AppIcon app={m.app} className="h-10 w-10" />
                      <span className="min-w-0">
                        <span className="block font-bold leading-tight">{m.title}</span>
                        <span className="mt-1.5 inline-flex items-center gap-1 text-sm font-semibold text-primary group-hover:text-primary-strong">
                          {t("write")}
                          <IconArrowRight aria-hidden className="h-4 w-4" />
                        </span>
                      </span>
                    </TrackedLink>
                  </li>
                ))}
              </ul>
            </div>

            {/* ── Правая колонка: карта ── */}
            {/* Карта тянется на высоту всей строки, поэтому её нижний край
                совпадает с нижним краем левой колонки. min-h нужен на случай,
                когда левая колонка короче карты (узкие ноутбуки). */}
            <div className="relative lg:h-full">
              <div className="h-full overflow-hidden rounded-3xl border border-line shadow-[0_18px_40px_-30px_rgba(15,34,51,0.5)]">
                <iframe
                  title={t("mapTitle")}
                  src={contacts.mapEmbed}
                  className="block h-[300px] w-full sm:h-[380px] lg:h-full lg:min-h-[480px]"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>

              {/* Единственное, что лежит НА карте. По центру и над надписью
                  Google: слева от неё логотип и окошко обзора улицы, справа —
                  строка «Картографические данные», и закрывать их нельзя. */}
              <TrackedLink
                href={contacts.mapLink}
                external
                newTab
                event="contact_click"
                data={{ channel: "maps", place: "contacts-map" }}
                className={buttonClasses({
                  // whitespace-nowrap обязателен: у absolute-элемента со сдвигом
                  // от левого края ширина считается от ОСТАТКА карты, и на
                  // телефоне подпись ломалась на две строки (мерил 03.09.2026).
                  className:
                    "absolute bottom-9 left-1/2 -translate-x-1/2 whitespace-nowrap shadow-[0_20px_44px_-26px_rgba(15,34,51,0.65)]",
                })}
              >
                <IconPin aria-hidden className="h-5 w-5" />
                {t("route")}
              </TrackedLink>
            </div>
          </div>
        </Container>
      </section>

      <Marquee items={marquee} />

      {/* ── Соцсети ── */}
      <Section pad="tight" className="bg-white">
        <Container>
          <h2 className="text-3xl font-bold sm:text-4xl">{t("socialTitle")}</h2>
          <Squiggle long className="mt-4" />
          <p className="mt-5 max-w-2xl text-muted">
            {t("socialText")}
          </p>

          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {socials.map((s) => (
                <TrackedLink
                  key={s.id}
                  href={s.href}
                  external
                  newTab
                  event="contact_click"
                  // Название соцсети — как в списке (Instagram, YouTube…),
                  // приводим к нижнему регистру, чтобы в отчёте не появлялись
                  // две строки на одну и ту же ссылку.
                  data={{ channel: s.name.toLowerCase(), place: "contacts" }}
                  className="flex flex-col items-center gap-2 rounded-3xl border border-line bg-surface px-3 py-5 text-center transition-colors hover:border-primary/40"
                >
                  <AppIcon app={s.app} className="h-12 w-12" />
                  <span className="text-sm font-bold leading-tight">
                    {tSocials.has(s.id) ? tSocials(s.id) : s.name}
                  </span>
                  <span className="break-all text-xs text-muted">{SOCIAL_HANDLE[s.id]}</span>
                </TrackedLink>
            ))}
          </div>
        </Container>
      </Section>

      {/* ── Заявка ── */}
      {/* Страница заканчивается морской плашкой: человеку, который дочитал до
          низа и так и не написал в мессенджер, остаётся способ проще — оставить
          заявку и ждать, пока свяжутся сами. */}
      <Section pad="tight" className="bg-gradient-to-b from-white to-surface-2">
        <Container>
          <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-primary-strong px-6 py-10 text-center text-white shadow-[0_24px_50px_-30px_rgba(15,34,51,0.6)] sm:px-10 sm:py-12">
            <span
              aria-hidden
              className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-white/15"
            >
              <IconChat className="h-7 w-7" />
            </span>
            <h2 className="mt-4 text-2xl font-bold sm:text-3xl">{t("ctaTitle")}</h2>
            <p className="mx-auto mt-3 max-w-xl text-white/90">
              {t("ctaText")}
            </p>
            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <BookBtn place="contacts-cta" size="lg" className="w-full sm:w-auto">
                {t("ctaButton")}
              </BookBtn>
              <TrackedLink
                href={contacts.phone.whatsapp}
                external
                newTab
                event="contact_click"
                data={{ channel: "whatsapp", place: "contacts-cta" }}
                className={buttonClasses({ variant: "light", size: "lg", className: "w-full sm:w-auto" })}
              >
                {t("writeWhatsApp")}
              </TrackedLink>
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
}
