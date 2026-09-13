import {
  EFOIL_ANGLES,
  shopProducts,
  type ShopEfoil,
  type ShopProduct,
} from "@/content/shop";
import {
  DEFAULT_LOCALE,
  isAppLocale,
  LOCALE_NAMES,
  LOCALE_NAMES_RU,
} from "@/i18n/locales";

// Правила магазина, общие для страницы и сервера: найти товар, собрать путь к
// фото, проверить, что гость выбрал то, что у нас правда есть, и сложить текст
// заявки для Telegram. Сам справочник — src/content/shop.ts.

export function findShopProduct(id: string | null | undefined): ShopProduct | null {
  if (!id) return null;
  return shopProducts.find((p) => p.id === id) ?? null;
}

// Фото доски: по одному на ракурс. Имена файлов собраны скриптом по шаблону
// <размер>-<цвет>-<ракурс>.webp, поэтому путь считаем, а не перечисляем руками
// сотню строк.
export function efoilImages(p: ShopEfoil, sizeId: string, colorId: string): string[] {
  return EFOIL_ANGLES.map((angle) => `/media/shop/${p.id}/${sizeId}-${colorId}-${angle}.webp`);
}

// Обложка товара в сетке каталога.
export function productCover(p: ShopProduct): string {
  return p.category === "efoil"
    ? efoilImages(p, p.defaultSizeId, p.colors[0].id)[0]
    : p.variants[0].images[0];
}

// Самая низкая цена товара — для «от $…» в каталоге.
export function priceFrom(p: ShopProduct): number {
  const prices =
    p.category === "efoil" ? p.sizes.map((s) => s.priceUsd) : p.variants.map((v) => v.priceUsd);
  return Math.min(...prices);
}

// Разные ли цены у размеров/вариантов. Нет — пишем просто «$14,999», а не
// «от $14,999»: у LIFT5 все три размера стоят одинаково, и «от» там врёт.
export function pricesVary(p: ShopProduct): boolean {
  const prices =
    p.category === "efoil" ? p.sizes.map((s) => s.priceUsd) : p.variants.map((v) => v.priceUsd);
  return new Set(prices).size > 1;
}

// Цена в долларах, «$14,999». Формат американский на любом языке сайта: это и
// есть американская розница, и так одна и та же строка выходит у сервера и в
// браузере (без расхождений при гидрации из-за локали).
const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function formatUsd(amount: number): string {
  return usd.format(amount);
}

// Что выбрал гость. productId = null — «просто проконсультируйте», без товара.
export interface ShopSelection {
  productId: string | null;
  sizeId?: string | null;
  colorId?: string | null;
  variantId?: string | null;
}

// Проверенный выбор: только то, что есть в справочнике. title — строка для
// людей («LIFT5 · 4'9 Sport · Steel Blue»), цена — из справочника, а не с
// клиента: заявке с сайта верить на слово нельзя.
export interface ShopItem {
  productId: string;
  title: string;
  priceUsd: number;
}

// null — такого товара, размера, цвета или варианта нет. Пустой размер или
// цвет не ошибка: берём то, что показано по умолчанию.
export function resolveShopSelection(sel: ShopSelection): ShopItem | null {
  const p = findShopProduct(sel.productId);
  if (!p) return null;

  if (p.category === "efoil") {
    const size = p.sizes.find((s) => s.id === (sel.sizeId || p.defaultSizeId));
    if (!size) return null;
    const color = sel.colorId ? p.colors.find((c) => c.id === sel.colorId) : null;
    if (sel.colorId && !color) return null;
    return {
      productId: p.id,
      title: [p.name, size.label, color?.name].filter(Boolean).join(" · "),
      priceUsd: size.priceUsd,
    };
  }

  const variant = p.variants.find((v) => v.id === (sel.variantId || p.variants[0].id));
  if (!variant) return null;
  return {
    productId: p.id,
    title: [p.name, variant.label].filter(Boolean).join(" · "),
    priceUsd: variant.priceUsd,
  };
}

// Текст уведомления в рабочий чат. Простым текстом, как остальные сообщения
// бота (см. lib/telegram): данные гостя уходят без экранирования Markdown.
export function buildShopInquiryText(b: {
  item: ShopItem | null;
  clientName: string;
  contact: string;
  messenger?: string | null;
  comment?: string | null;
  locale?: string | null;
}): string {
  const lines = ["🛒 Запрос из магазина", ""];
  if (b.item) {
    lines.push(`📦 Товар: ${b.item.title}`);
    lines.push(`💵 Цена на сайте: ${formatUsd(b.item.priceUsd)} (розница Lift в США)`);
  } else {
    lines.push("📦 Нужна консультация по выбору");
  }
  lines.push(`👤 Имя: ${b.clientName}`);
  lines.push(`📞 Контакт: ${b.messenger ? `${b.contact} (${b.messenger})` : b.contact}`);
  if (b.comment) lines.push(`💬 Комментарий: ${b.comment}`);
  // Как в заявках на полёт: язык показываем, только если он не русский.
  if (b.locale && b.locale !== DEFAULT_LOCALE && isAppLocale(b.locale)) {
    lines.push(`🌐 Язык клиента: ${LOCALE_NAMES_RU[b.locale]} (${LOCALE_NAMES[b.locale]})`);
  }
  return lines.join("\n");
}
