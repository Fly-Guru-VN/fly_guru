import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { NAV_LINKS } from "./nav";
import { IconPhone, IconChat, IconPin } from "./icons";
import { TrackedLink } from "./TrackedLink";
import { contacts, socials } from "@/content/contacts";

// Футер: навигация + контакты/соцсети/мессенджеры.
// Данные — из src/content/contacts.ts.
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-surface">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-3">
        {/* Бренд */}
        <div>
          <div className="flex items-center gap-2 font-bold">
            <Image src="/brand/flyguru-logo.jpg" alt="FlyGuru" width={40} height={40} className="rounded-full" />
            <span className="text-lg">FlyGuru</span>
          </div>
          <p className="mt-3 max-w-xs text-sm text-muted">
            Школа электрофойлов в Нячанге. Полёт над водой с первого занятия.
          </p>
        </div>

        {/* Навигация */}
        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Разделы</h3>
          <ul className="grid grid-cols-2 gap-2 text-sm">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-muted hover:text-ink">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Контакты */}
        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Контакты</h3>
          <ul className="space-y-2 text-sm text-muted">
            <li className="flex items-center gap-2">
              <IconPhone className="h-5 w-5 shrink-0 text-primary" />
              <TrackedLink
                href={contacts.phone.tel}
                external
                event="contact_click"
                data={{ channel: "phone", place: "footer" }}
                className="hover:text-ink"
              >
                {contacts.phone.display}
              </TrackedLink>
            </li>
            <li className="flex items-center gap-2">
              <IconChat className="h-5 w-5 shrink-0 text-primary" />
              <span>
                <TrackedLink
                  href={contacts.phone.whatsapp}
                  external
                  event="contact_click"
                  data={{ channel: "whatsapp", place: "footer" }}
                  className="hover:text-ink"
                >
                  WhatsApp
                </TrackedLink>
                {" · "}
                <TrackedLink
                  href={contacts.telegram}
                  external
                  event="contact_click"
                  data={{ channel: "telegram", place: "footer" }}
                  className="hover:text-ink"
                >
                  Telegram
                </TrackedLink>
                {" · "}
                <TrackedLink
                  href={contacts.zalo}
                  external
                  event="contact_click"
                  data={{ channel: "zalo", place: "footer" }}
                  className="hover:text-ink"
                >
                  Zalo
                </TrackedLink>
              </span>
            </li>
            <li className="flex items-center gap-2">
              <IconPin className="h-5 w-5 shrink-0 text-primary" />
              <TrackedLink
                href={contacts.mapLink}
                external
                newTab
                event="contact_click"
                data={{ channel: "maps", place: "footer" }}
                className="hover:text-ink"
              >
                {contacts.address}
              </TrackedLink>
            </li>
          </ul>
          <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-sm">
            {socials.map((s) => (
              <TrackedLink
                key={s.name}
                href={s.href}
                external
                newTab
                event="contact_click"
                // Название соцсети — как в списке (Instagram, YouTube…),
                // приводим к нижнему регистру, чтобы в отчёте не появлялись
                // две строки на одну и ту же ссылку.
                data={{ channel: s.name.toLowerCase(), place: "footer" }}
                className="text-primary hover:text-primary-strong"
              >
                {s.name}
              </TrackedLink>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-line py-5 text-center text-xs text-muted">
        © {new Date().getFullYear()} FlyGuru. Все права защищены.
      </div>
    </footer>
  );
}
