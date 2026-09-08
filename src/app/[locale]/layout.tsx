import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import Script from "next/script";
import { Manrope } from "next/font/google";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { SiteHeader } from "@/components/SiteHeader";
import { PageTransition } from "@/components/PageTransition";
import { SiteFooter } from "@/components/SiteFooter";
import { MobileTabBar } from "@/components/MobileTabBar";
import { SwipeNav } from "@/components/SwipeNav";
import { Attribution } from "@/components/Attribution";
import { BookingProvider } from "@/components/BookingProvider";
import { HideInMiniApp } from "@/components/HideInMiniApp";
import { getActiveServices } from "@/lib/services";
import { SITE_URL } from "@/lib/site";
import "../globals.css";

// Self-hosted шрифт (грузится с нашего домена, без обращения к Google на клиенте).
const font = Manrope({
  subsets: ["latin", "cyrillic"],
  variable: "--font-app",
});

// Счётчик Google Analytics 4 (аккаунт flyguru.pro). ID публичный по своей
// природе — он и так виден в исходнике страницы, поэтому держим его здесь, а не
// в env: одно место, ничего не забудешь прописать на Vercel.
const GA_ID = "G-QXK4DXPN3X";

// Тег ставим только на бою. На localhost NODE_ENV === "development", и без этой
// проверки каждая наша отладка попадала бы в отчёты как визит клиента.
// Preview-деплои Vercel отсекаем отдельно: если системная переменная не
// прокинута в сборку, условие остаётся истинным — лучше лишний preview в
// статистике, чем молча потерянный счётчик на проде.
const GA_ENABLED =
  process.env.NODE_ENV === "production" &&
  process.env.NEXT_PUBLIC_VERCEL_ENV !== "preview";

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
    // data-scroll-behavior — обязательная пара к `html { scroll-behavior: smooth }`
    // из globals.css. По этому атрибуту Next на переходе между страницами
    // временно гасит плавную прокрутку. Без него его собственная прокрутка
    // наверх уезжала плавно, Next тут же мерил ещё старую позицию, решал, что
    // верх страницы не в кадре, и добивал scrollIntoView — новая страница
    // открывалась прокрученной на высоту шапки, с обрезанным первым экраном.
    <html
      lang={locale}
      data-scroll-behavior="smooth"
      className={`${font.variable} h-full`}
    >
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider>
          {/* Невидимая «ловушка меток» источника — работает на всех страницах. */}
          <Attribution />
          <BookingProvider services={services}>
            <HideInMiniApp>
              <SiteHeader />
            </HideInMiniApp>
            <main className="flex-1">
              {/* SwipeNav снаружи PageTransition: пролистывание пальцем двигает
                  всё содержимое страницы разом, а появление после перехода
                  остаётся на PageTransition — он для этого и заведён. */}
              <SwipeNav>
                <PageTransition>{children}</PageTransition>
              </SwipeNav>
            </main>
            <HideInMiniApp>
              <SiteFooter />
            </HideInMiniApp>
            {/* Нижняя панель разделов на телефоне. Стоит последней, потому что
                рисуется поверх всего и сама же добавляет подвалу нижнее поле
                под свою высоту (в кабинетах её нет — там панель своя). */}
            <MobileTabBar />
          </BookingProvider>
        </NextIntlClientProvider>
        {/* Счётчик посещений Vercel: считает визиты и просмотры страниц БЕЗ
            cookie и без личных данных, поэтому баннер согласия не нужен.
            Данные — во вкладке Analytics проекта на Vercel. */}
        <Analytics />
        {/* Тег Google по инструкции GA4: сначала загрузчик gtag.js, следом
            инициализация. strategy="afterInteractive" — Next сам вставит их в
            страницу после гидрации, чтобы счётчик не задерживал первый экран.
            Переходы между страницами GA4 считает сам (в Enhanced measurement
            включён пункт про историю браузера), отдельного кода не нужно. */}
        {GA_ENABLED ? (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
              strategy="afterInteractive"
            />
            <Script id="ga4" strategy="afterInteractive">
              {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}');`}
            </Script>
          </>
        ) : null}
      </body>
    </html>
  );
}
