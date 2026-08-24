import type { Metadata } from "next";
import Image from "next/image";
import { Container, Section, buttonClasses } from "@/components/ui";
import { Squiggle } from "@/components/Squiggle";
import { HeroStage } from "@/components/HeroStage";
import { Marquee } from "@/components/Marquee";
import { BookBtn } from "@/components/BookBtn";
import { TrackedLink } from "@/components/TrackedLink";
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
  IconTelegram,
  IconZalo,
  IconMail,
  IconInstagram,
  IconYouTube,
  IconTikTok,
  IconFacebook,
} from "@/components/icons";
import { contacts, socials } from "@/content/contacts";

export const metadata: Metadata = { title: "Контакты" };
export const dynamic = "force-static"; // статичная страница, форсим SSG

// Страница контактов собрана тем же языком, что обучение, тандем и клуб: кадр
// во весь экран, бегущая строка, дальше — крупные блоки без лишнего текста.
//
// Главное отличие от прежней версии: контакт — это ДЕЙСТВИЕ, а не строчка
// справочника. Поэтому каждый канал связи здесь целая карточка-ссылка, в
// которую попадаешь пальцем с первого раза, а самый быстрый канал (WhatsApp)
// выделен рамкой, как «популярный» формат на обучении.
//
// Ничего сверх того, что лежит в src/content/contacts.ts, страница не обещает:
// часы, адрес, каналы — оттуда, правятся в одном месте.

// Значок соцсети и её адрес «как в приложении»: имя канала человек ищет
// глазами быстрее, чем длинную ссылку. Ключ — имя из списка socials.
const SOCIAL_META = {
  Instagram: { icon: IconInstagram, handle: "@flyguru.club" },
  YouTube: { icon: IconYouTube, handle: "@fly_guru" },
  TikTok: { icon: IconTikTok, handle: "@denisflyguru" },
  Facebook: { icon: IconFacebook, handle: "FlyGuru" },
  "Telegram-канал": { icon: IconTelegram, handle: "@flyguru_club" },
} as const;

export default async function ContactsPage() {
  // Вилка цен для разметки — из базы, как и на главной (см. lib/schema.ts).
  const priceRange = priceRangeLabel(await getSiteServices());

  // Условия связи — плашками на кадре: их ищут глазами первыми.
  const heroFacts = [contacts.hours, "Нячанг · Maryna Beach Club", "Отвечаем в мессенджере"];

  const marquee = [
    contacts.hours,
    "WhatsApp · Telegram · Zalo",
    "Нячанг · Maryna Beach Club",
    "Запись за пару сообщений",
    contacts.phone.display,
  ];

  // Каналы связи. primary — тот, которым пользуются чаще всего: на него
  // приходит большая часть заявок, поэтому он выделен рамкой.
  // newTab только у внешних приложений: tel: и mailto: открывают не страницу, а
  // звонилку с почтой, и пустая вкладка после них висела бы мусором.
  const channels = [
    {
      icon: IconWhatsApp,
      title: "WhatsApp",
      value: contacts.phone.display,
      action: "Написать",
      href: contacts.phone.whatsapp,
      key: "whatsapp",
      newTab: true,
      primary: true,
    },
    {
      icon: IconTelegram,
      title: "Telegram",
      value: contacts.phone.display,
      action: "Написать",
      href: contacts.telegram,
      key: "telegram",
      newTab: true,
      primary: false,
    },
    {
      icon: IconZalo,
      title: "Zalo",
      value: contacts.phone.display,
      action: "Написать",
      href: contacts.zalo,
      key: "zalo",
      newTab: true,
      primary: false,
    },
    {
      icon: IconPhone,
      title: "Позвонить",
      value: contacts.phone.display,
      action: "Набрать номер",
      href: contacts.phone.tel,
      key: "phone",
      newTab: false,
      primary: false,
    },
    {
      icon: IconMail,
      title: "Почта",
      value: contacts.email,
      action: "Написать письмо",
      href: `mailto:${contacts.email}`,
      key: "email",
      newTab: false,
      primary: false,
    },
  ];

  return (
    <>
      {/* Та же карточка школы, что и на главной (общий @id внутри): именно эту
          страницу поисковик считает страницей контактов организации. */}
      <JsonLd data={businessSchema(priceRange)} />

      {/* ── Первый экран ── */}
      {/* Кадр во весь экран и вплотную к шапке, как на обучении. Главное
          действие страницы — кнопка мессенджера — лежит прямо на кадре: до
          карточек ниже человеку с телефона ещё надо доскроллить. */}
      <HeroStage
        image="/media/photo/training-master.webp"
        alt="Райдер летит на электрофойле над бирюзовой водой в Нячанге"
        bleed
      >
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-white/80 drop-shadow-[0_1px_8px_rgba(0,0,0,0.5)]">
            Контакты
          </p>
          <h1 className="mt-3 text-4xl font-bold leading-[1.05] drop-shadow-[0_2px_14px_rgba(0,0,0,0.5)] sm:text-5xl md:text-6xl">
            Мы на связи
            <br />
            каждый день
          </h1>
          <p className="mt-4 max-w-md text-base text-white/90 drop-shadow-[0_1px_8px_rgba(0,0,0,0.5)] sm:text-lg">
            Напишите в любой мессенджер: подберём время, ответим на вопросы и
            подскажем, как нас найти.
          </p>
        </div>
        <div>
          <ul className="mt-6 flex flex-wrap gap-2">
            {heroFacts.map((f) => (
              <li
                key={f}
                className="rounded-full border border-white/40 bg-white/10 px-3 py-1.5 text-sm font-semibold backdrop-blur-sm"
              >
                {f}
              </li>
            ))}
          </ul>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <TrackedLink
              href={contacts.phone.whatsapp}
              external
              newTab
              event="contact_click"
              data={{ channel: "whatsapp", place: "contacts-hero" }}
              className={buttonClasses({ size: "lg", className: "w-full sm:w-auto" })}
            >
              Написать в WhatsApp
            </TrackedLink>
            <TrackedLink
              href={contacts.phone.tel}
              external
              event="contact_click"
              data={{ channel: "phone", place: "contacts-hero" }}
              className={buttonClasses({ variant: "light", size: "lg", className: "w-full sm:w-auto" })}
            >
              Позвонить
            </TrackedLink>
          </div>
        </div>
      </HeroStage>

      <Marquee items={marquee} />

      {/* ── Каналы связи ── */}
      <Section pad="tight" className="relative overflow-hidden bg-gradient-to-b from-white to-surface-2">
        {/* Чайки — как в блоках главной: только от md, на телефоне декор съедал
            бы место. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 hidden md:block">
          <Image
            src="/media/decor/bird.webp"
            alt=""
            width={320}
            height={117}
            className="absolute right-24 top-10 w-14 -rotate-[7deg] opacity-90"
          />
          <Image
            src="/media/decor/bird.webp"
            alt=""
            width={320}
            height={117}
            className="absolute right-8 top-24 w-[4.5rem] rotate-[5deg]"
          />
        </div>

        <Container className="relative">
          <h2 className="text-3xl font-bold sm:text-4xl">Напишите нам</h2>
          <Squiggle long className="mt-4" />
          <p className="mt-5 max-w-2xl text-muted">
            Быстрее всего — в мессенджер: там мы отвечаем в течение дня и сразу
            держим переписку под рукой. Звонок тоже работает, но в море трубку
            берут не всегда.
          </p>

          {/* Каждый канал — целая карточка-ссылка, а не строчка текста: по ней
              легко попасть пальцем, и видно, что произойдёт после нажатия. */}
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {channels.map((c) => (
              <TrackedLink
                key={c.title}
                href={c.href}
                external
                newTab={c.newTab}
                event="contact_click"
                data={{ channel: c.key, place: "contacts" }}
                className={`group flex items-start gap-4 rounded-3xl bg-surface p-5 transition-colors ${
                  c.primary
                    ? "border-2 border-primary shadow-[0_18px_40px_-30px_rgba(15,34,51,0.5)]"
                    : "border border-line hover:border-primary/40"
                }`}
              >
                <span
                  aria-hidden
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"
                >
                  <c.icon className="h-6 w-6" />
                </span>
                <span className="min-w-0">
                  <span className="block font-bold">{c.title}</span>
                  <span className="mt-0.5 block break-words text-sm text-muted">{c.value}</span>
                  <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary group-hover:text-primary-strong">
                    {c.action}
                    <IconArrowRight aria-hidden className="h-4 w-4" />
                  </span>
                </span>
              </TrackedLink>
            ))}
          </div>
        </Container>
      </Section>

      {/* ── Где нас найти ── */}
      <Section pad="tight" className="bg-gradient-to-b from-surface-2 to-white">
        <Container>
          <h2 className="text-3xl font-bold sm:text-4xl">Где нас найти</h2>
          <Squiggle long className="mt-4" />

          {/* Адрес слева, карта справа и во всю высоту карточки: на карту
              смотрят дольше, чем читают адрес, поэтому места ей больше.
              На телефоне порядок тот же — сначала адрес словами, потом карта. */}
          <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
            <div className="flex flex-col rounded-3xl border border-line bg-surface p-6 shadow-[0_18px_40px_-30px_rgba(15,34,51,0.5)]">
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"
                >
                  <IconPin className="h-6 w-6" />
                </span>
                <div>
                  <h3 className="font-bold">Адрес</h3>
                  <p className="mt-1 text-sm text-muted">{contacts.address}</p>
                </div>
              </div>

              <div className="mt-5 flex items-start gap-3">
                <span
                  aria-hidden
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"
                >
                  <IconClock className="h-6 w-6" />
                </span>
                <div>
                  <h3 className="font-bold">Работаем</h3>
                  <p className="mt-1 text-sm text-muted">{contacts.hours}</p>
                </div>
              </div>

              <p className="mt-5 text-sm text-muted">
                Школа стоит на территории пляжного клуба — метка на карте наша,
                по ней и ориентируйтесь.
              </p>

              <TrackedLink
                href={contacts.mapLink}
                external
                newTab
                event="contact_click"
                data={{ channel: "maps", place: "contacts" }}
                // mt-auto: на широком экране карточка растянута под высоту карты, и кнопка
                // должна лежать у её нижнего края, а не висеть в середине пустоты.
                className={buttonClasses({ variant: "sea", className: "mt-6 w-full lg:mt-auto" })}
              >
                Открыть в Google Maps
                <IconArrowRight aria-hidden className="h-4 w-4" />
              </TrackedLink>
            </div>

            {/* Карта тянется на высоту соседней карточки (растяжение грид-строки),
                но на телефоне и планшете колонка одна — там высоту задаём сами.
                Нижний предел нужен на 1024 px: там карточка адреса короткая, и
                без него карта превращалась в полоску высотой в четверть экрана. */}
            <div className="overflow-hidden rounded-3xl border border-line shadow-[0_18px_40px_-30px_rgba(15,34,51,0.5)] lg:min-h-[420px]">
              <iframe
                title="FlyGuru на карте — Maryna Beach Club, Нячанг"
                src={contacts.mapEmbed}
                className="h-[320px] w-full sm:h-[420px] lg:h-full"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </div>
        </Container>
      </Section>

      {/* ── Соцсети ── */}
      <Section pad="tight" className="bg-white">
        <Container>
          <h2 className="text-3xl font-bold sm:text-4xl">Мы в соцсетях</h2>
          <Squiggle long className="mt-4" />
          <p className="mt-5 max-w-2xl text-muted">
            Там видно, как проходят занятия и куда мы ходим на выездах — это и
            есть самый честный ответ на вопрос «а что там вообще происходит».
          </p>

          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {socials.map((s) => {
              const meta = SOCIAL_META[s.name];
              return (
                <TrackedLink
                  key={s.name}
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
                  <span
                    aria-hidden
                    className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"
                  >
                    <meta.icon className="h-6 w-6" />
                  </span>
                  <span className="text-sm font-bold leading-tight">{s.name}</span>
                  <span className="break-all text-xs text-muted">{meta.handle}</span>
                </TrackedLink>
              );
            })}
          </div>
        </Container>
      </Section>

      {/* ── Заявка ── */}
      {/* Страница заканчивается морской плашкой: человеку, который дочитал до
          низа и так и не написал в мессенджер, остаётся способ проще — форма,
          где мы напишем ему сами. */}
      <Section pad="tight" className="bg-gradient-to-b from-white to-surface-2">
        <Container>
          <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-primary-strong px-6 py-10 text-center text-white shadow-[0_24px_50px_-30px_rgba(15,34,51,0.6)] sm:px-10 sm:py-12">
            <span
              aria-hidden
              className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-white/15"
            >
              <IconChat className="h-7 w-7" />
            </span>
            <h2 className="mt-4 text-2xl font-bold sm:text-3xl">Не любите переписку?</h2>
            <p className="mx-auto mt-3 max-w-xl text-white/90">
              Оставьте заявку — напишем сами, подберём время и ответим на все
              вопросы. Это две минуты и три поля.
            </p>
            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <BookBtn place="contacts-cta" size="lg" className="w-full sm:w-auto">
                Оставить заявку
              </BookBtn>
              <TrackedLink
                href={contacts.phone.whatsapp}
                external
                newTab
                event="contact_click"
                data={{ channel: "whatsapp", place: "contacts-cta" }}
                className={buttonClasses({ variant: "light", size: "lg", className: "w-full sm:w-auto" })}
              >
                Написать в WhatsApp
              </TrackedLink>
            </div>
          </div>
        </Container>
      </Section>
    </>
  );
}
