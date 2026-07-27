import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { SiteHeader } from "@/components/SiteHeader";
import { PageTransition } from "@/components/PageTransition";
import { SiteFooter } from "@/components/SiteFooter";
import { Attribution } from "@/components/Attribution";
import { BookingProvider } from "@/components/BookingProvider";
import { getActiveServices } from "@/lib/services";
import { SITE_URL } from "@/lib/site";
import "../globals.css";

// Self-hosted шрифт (грузится с нашего домена, без обращения к Google на клиенте).
const font = Manrope({ subsets: ["latin", "cyrillic"], variable: "--font-app" });

const TITLE = "FlyGuru — школа электрофойлов в Нячанге";
const DESCRIPTION =
  "Обучение полёту на электрофойле в Нячанге. 90% учеников едут уже на первом занятии.";

export const metadata: Metadata = {
  // metadataBase превращает относительные пути ниже (/og.jpg) в абсолютные.
  // Без него Next не может собрать og:image, а мессенджеры показывают ссылку
  // голым текстом — именно так flyguru.pro и уходила клиентам в WhatsApp.
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s · FlyGuru",
  },
  description: DESCRIPTION,
  // Превью ссылки: картинка 1200×630 (собрана из фото на воде) + подпись.
  // Тот же набор читают WhatsApp, Telegram, Facebook и Instagram.
  openGraph: {
    type: "website",
    siteName: "FlyGuru",
    locale: "ru_RU",
    url: SITE_URL,
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: "/og.jpg",
        width: 1200,
        height: 630,
        alt: "Гость FlyGuru едет на электрофойле в Нячанге",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/og.jpg"],
  },
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  // Все активные услуги (любой формат проката) — для единой модалки записи.
  // Грузим один раз здесь, раздаём через BookingProvider всем кнопкам сайта.
  const services = await getActiveServices();

  return (
    <html lang={locale} className={`${font.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider>
          {/* Невидимая «ловушка меток» источника — работает на всех страницах. */}
          <Attribution />
          <BookingProvider services={services}>
            <SiteHeader />
            <main className="flex-1">
              <PageTransition>{children}</PageTransition>
            </main>
            <SiteFooter />
          </BookingProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
