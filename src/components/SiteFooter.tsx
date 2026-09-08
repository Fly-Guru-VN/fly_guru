import { useTranslations } from "next-intl";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { NAV_LINKS } from "./nav";
import { IconPhone, IconChat, IconPin } from "./icons";
import { TrackedLink } from "./TrackedLink";
import { contacts, socials } from "@/content/contacts";
import { AppIcon } from "./AppIcon";

// Футер: навигация + контакты/соцсети/мессенджеры.
// Данные — из src/content/contacts.ts.
export function SiteFooter() {
  const t = useTranslations("Footer");
  const tNav = useTranslations("Nav");
  // Подписи соцсетей: у большинства это само название сети и переводить его не
  // нужно, поэтому в messages лежат только те, где есть русские слова.
  const tSocials = useTranslations("Socials");
  const tContacts = useTranslations("Contacts");

  return (
    <footer className="mt-auto border-t border-line bg-surface">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-3">
        {/* Бренд */}
        <div>
          <div className="flex items-center gap-2 font-bold">
            <Image src="/brand/flyguru-logo.jpg" alt="FlyGuru" width={40} height={40} className="rounded-full" />
            <span className="text-lg">FlyGuru</span>
          </div>
          <p className="mt-3 max-w-xs text-sm text-muted">{t("tagline")}</p>
        </div>

        {/* Навигация */}
        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{t("sections")}</h3>
          <ul className="grid grid-cols-2 gap-2 text-sm">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-muted hover:text-ink">
                  {tNav(l.key)}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Контакты */}
        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{t("contacts")}</h3>
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
                {tContacts("address")}
              </TrackedLink>
            </li>
          </ul>
          {/* Соцсети — фирменными значками, а не словами: в логотип на телефоне
              попадают пальцем с первого раза, а мелкие ссылки в строчку
              приходилось выцеливать. Название остаётся для читалки экрана. */}
          <div className="mt-4 flex flex-wrap gap-3">
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
                ariaLabel={tSocials.has(s.id) ? tSocials(s.id) : s.name}
                className="rounded-xl transition-transform hover:-translate-y-0.5 active:scale-95"
              >
                <AppIcon app={s.app} className="h-9 w-9" />
              </TrackedLink>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-line py-5 text-center text-xs text-muted">
        {t("rights", { year: String(new Date().getFullYear()) })}
      </div>
    </footer>
  );
}
