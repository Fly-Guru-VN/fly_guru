import type { Metadata } from "next";
import { Container, Section, SectionHeading, Card } from "@/components/ui";
import { IconPhone, IconChat, IconPin } from "@/components/icons";
import { TrackedLink } from "@/components/TrackedLink";
import { JsonLd } from "@/components/JsonLd";
import { businessSchema } from "@/lib/schema";
import { contacts, socials } from "@/content/contacts";

export const metadata: Metadata = { title: "Контакты" };
export const dynamic = "force-static"; // статичная страница, форсим SSG

export default function ContactsPage() {
  return (
    <Section className="pt-10 sm:pt-14">
      {/* Та же карточка школы, что и на главной (общий @id внутри): именно эту
          страницу поисковик считает страницей контактов организации. */}
      <JsonLd data={businessSchema()} />
      <Container>
        <SectionHeading eyebrow="Контакты" title="Как с нами связаться" subtitle="Пишите в мессенджер — отвечаем быстро." />

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          <Card>
            <IconPhone className="h-7 w-7 text-primary" />
            <h3 className="mt-3 font-bold">Телефон / WhatsApp</h3>
            <p className="mt-1">
              <TrackedLink
                href={contacts.phone.tel}
                external
                event="contact_click"
                data={{ channel: "phone", place: "contacts" }}
                className="text-muted hover:text-ink"
              >
                {contacts.phone.display}
              </TrackedLink>
            </p>
            <p className="mt-2 text-sm text-muted">{contacts.hours}</p>
          </Card>

          <Card>
            <IconChat className="h-7 w-7 text-primary" />
            <h3 className="mt-3 font-bold">Мессенджеры</h3>
            <div className="mt-1 flex flex-col gap-1 text-muted">
              <TrackedLink
                href={contacts.phone.whatsapp}
                external
                event="contact_click"
                data={{ channel: "whatsapp", place: "contacts" }}
                className="hover:text-ink"
              >
                WhatsApp
              </TrackedLink>
              <TrackedLink
                href={contacts.telegram}
                external
                event="contact_click"
                data={{ channel: "telegram", place: "contacts" }}
                className="hover:text-ink"
              >
                Telegram
              </TrackedLink>
              <TrackedLink
                href={contacts.zalo}
                external
                event="contact_click"
                data={{ channel: "zalo", place: "contacts" }}
                className="hover:text-ink"
              >
                Zalo
              </TrackedLink>
              <TrackedLink
                href={`mailto:${contacts.email}`}
                external
                event="contact_click"
                data={{ channel: "email", place: "contacts" }}
                className="hover:text-ink"
              >
                {contacts.email}
              </TrackedLink>
            </div>
          </Card>

          <Card>
            <IconPin className="h-7 w-7 text-primary" />
            <h3 className="mt-3 font-bold">Где нас найти</h3>
            <p className="mt-1 text-muted">{contacts.address}</p>
            <TrackedLink
              href={contacts.mapLink}
              external
              newTab
              event="contact_click"
              data={{ channel: "maps", place: "contacts" }}
              className="mt-2 inline-block text-sm font-semibold text-primary hover:text-primary-strong"
            >
              Открыть в Google Maps
            </TrackedLink>
          </Card>
        </div>

        {/* Соцсети */}
        <div className="mt-8 flex flex-wrap gap-4 text-sm">
          {socials.map((s) => (
            <TrackedLink
              key={s.name}
              href={s.href}
              external
              newTab
              event="contact_click"
              data={{ channel: s.name.toLowerCase(), place: "contacts" }}
              className="font-semibold text-primary hover:text-primary-strong"
            >
              {s.name}
            </TrackedLink>
          ))}
        </div>

        {/* Карта */}
        <div className="mt-10 overflow-hidden rounded-2xl border border-line">
          <iframe
            title="FlyGuru на карте — Maryna Beach Club, Нячанг"
            src={contacts.mapEmbed}
            className="h-[320px] w-full sm:h-[420px]"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </Container>
    </Section>
  );
}
