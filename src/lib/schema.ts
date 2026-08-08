import { contacts, socials } from "@/content/contacts";
import type { Service } from "@/content/services";
import { CATEGORY_LABELS } from "@/content/services";
import { SITE_URL } from "./site";

// Разметка организации (JSON-LD, schema.org).
//
// Что это даёт. Обычная страница для Google — просто текст. Разметка говорит
// прямым текстом: это спортивная школа, вот адрес, телефон, часы работы и
// координаты. Из этого Google собирает карточку в выдаче (адрес, часы, кнопка
// «позвонить») и увереннее связывает сайт с точкой на картах.
//
// Всё, что здесь перечислено, ДОЛЖНО совпадать с тем, что видит человек на
// странице и что указано в карточке Google Maps. Разметка, которая обещает
// больше, чем есть на странице, — прямое нарушение правил Google.

// Постоянный «адрес» организации внутри разметки. По нему страницы ссылаются на
// одну и ту же школу: без общего @id Google видит на каждой странице новую
// организацию с тем же названием.
export const ORG_ID = `${SITE_URL}/#business`;

// Координаты — из той же метки на картах, что стоит в контактах
// (maps.app.goo.gl/1rgSHUMUsvq3VUnT7 → 12.2931615, 109.2155281).
const GEO = { lat: 12.2931615, lng: 109.2155281 };

const DESCRIPTION =
  "Школа электрофойлов в Нячанге: обучение с нуля, полёты в тандеме, прокат, " +
  "экскурсии и продажа электрофойлов. 90% учеников встают на крыло уже на первом занятии.";

// Тип SportsActivityLocation — это «место для занятий спортом» из справочника
// schema.org, наследник обычного LocalBusiness. Он точнее описывает школу с
// собственной точкой на пляже, чем безликая «организация».
// «Вилка цен» для карточки: от самой дешёвой услуги до самой дорогой.
// Считаем по тем же ценам из базы, что стоят в прайсе, — вручную вписанная
// вилка устарела бы при первой же правке цен в админке.
export function priceRangeLabel(services: Service[]): string {
  const prices = services
    .map((s) => s.price)
    .filter((p): p is number => p != null);
  if (prices.length === 0) return "";
  const money = (n: number) => n.toLocaleString("ru-RU");
  return `${money(Math.min(...prices))}–${money(Math.max(...prices))} ₫`;
}

// priceRange — необязательное поле, но Google на его отсутствие ругается
// («незначительная проблема») и без него не показывает вилку цен в карточке.
export function businessSchema(priceRange?: string) {
  return {
    "@context": "https://schema.org",
    "@type": "SportsActivityLocation",
    "@id": ORG_ID,
    name: "FlyGuru",
    // Название в карточке Google Maps отличается от вывески на сайте —
    // указываем оба, иначе Google может не связать сайт и точку на картах.
    alternateName: "FlyGuru Efoil",
    description: DESCRIPTION,
    url: SITE_URL,
    logo: `${SITE_URL}/icon.png`,
    image: `${SITE_URL}/og.jpg`,
    telephone: contacts.phone.raw,
    email: contacts.email,
    address: {
      "@type": "PostalAddress",
      streetAddress: "Maryna Beach Club",
      addressLocality: "Nha Trang",
      addressRegion: "Khánh Hòa",
      addressCountry: "VN",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: GEO.lat,
      longitude: GEO.lng,
    },
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        // Работаем без выходных — перечисляем все дни, как того требует формат.
        dayOfWeek: [
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
          "Sunday",
        ],
        opens: "08:30",
        closes: "18:00",
      },
    ],
    currenciesAccepted: "VND",
    // Пустую строку не отдаём: поле без значения хуже, чем его отсутствие.
    ...(priceRange ? { priceRange } : {}),
    // sameAs — «это та же самая школа, что и вот здесь». Сюда идут карточка на
    // картах и соцсети: так Google связывает сайт, точку и аккаунты в один
    // бизнес, а не в несколько разных.
    sameAs: [contacts.mapLink, ...socials.map((s) => s.href)],
    areaServed: {
      "@type": "City",
      name: "Nha Trang",
    },
    // ВАЖНО: рейтинг и отзывы здесь НЕ размечаем. Отзывы на сайте собраны в
    // Google Maps, а выдавать чужие отзывы за собранные у себя правила Google
    // прямо запрещают — за это прилетает ручная санкция. Звёзды в выдаче
    // Google и так берёт из карточки на картах.
  };
}

// Каталог услуг с настоящими ценами — для страницы прайса. Цены приходят из
// базы (правятся в админке), поэтому разметка не разъезжается с таблицей на
// странице: и то и другое из одного источника.
export function priceListSchema(services: Service[]) {
  const paid = services.filter((s) => s.price != null);

  return {
    "@context": "https://schema.org",
    "@type": "OfferCatalog",
    name: "Услуги и цены FlyGuru",
    url: `${SITE_URL}/prices`,
    provider: { "@id": ORG_ID },
    itemListElement: paid.map((s, i) => ({
      "@type": "Offer",
      position: i + 1,
      name: s.name,
      price: s.price,
      priceCurrency: "VND",
      url: `${SITE_URL}/prices`,
      availability: "https://schema.org/InStock",
      itemOffered: {
        "@type": "Service",
        name: s.name,
        serviceType: CATEGORY_LABELS[s.category],
        provider: { "@id": ORG_ID },
      },
    })),
  };
}
