import type { Service } from "@/content/services";

// Тексты услуг на языке гостя.
//
// Справочник src/content/services.ts держит только структуру (цены, картинки,
// категории), а название, описание и приписка лежат в messages, раздел
// Services, под ключом = id услуги. Здесь они соединяются обратно.
//
// Зачем так: услуг тринадцать, и каждая называется на семи языках. Держать эти
// названия в TS-файле рядом с ценами значило бы либо семь копий справочника,
// либо семь полей у каждой услуги.
//
// Тип переводчика описан структурно, а не импортом из next-intl: функция
// одинаково работает и с серверным getTranslations, и с клиентским
// useTranslations, а их типы friendly друг другу не приводятся.
export interface ServiceTranslator {
  (key: string): string;
  has(key: string): boolean;
}

// Одна услуга с подставленными текстами. Ключа в messages нет (услугу завели в
// админке, а перевода ей никто не написал) — поле просто остаётся пустым, и
// карточка рисуется без описания вместо того, чтобы падать.
export function localizeService(service: Service, t: ServiceTranslator): Service {
  const pick = (field: string) => {
    const key = `${service.id}.${field}`;
    return t.has(key) ? t(key) : undefined;
  };

  return {
    ...service,
    name: pick("name") ?? service.name,
    blurb: pick("blurb") ?? service.blurb,
    note: pick("note") ?? service.note,
    durationLabel: pick("durationLabel") ?? service.durationLabel,
  };
}

export function localizeServices(
  services: Service[],
  t: ServiceTranslator,
): Service[] {
  return services.map((s) => localizeService(s, t));
}

// Название услуги из БАЗЫ (форма записи работает с настоящими uuid). Связь с
// переводом — по code: он совпадает с id услуги в справочнике. Услуге, которую
// завели в админке и не перевели, остаётся её русское имя из базы: показать
// как есть честнее, чем пустую строку.
export function localizeServiceName(
  name: string,
  code: string | null | undefined,
  t: ServiceTranslator,
): string {
  const key = code ? `${code}.name` : "";
  return key && t.has(key) ? t(key) : name;
}

// Цена в донгах на языке гостя: «2 000 000 ₫» по-русски, «2.000.000 ₫»
// по-немецки, «2,000,000 ₫» по-английски. Разделитель групп у каждого языка
// свой, и жёстко зашитый пробел (как было в formatVnd) немцу читается как
// опечатка.
//
// formatVnd из content/services.ts никуда не делся — он остался кабинетам, там
// интерфейс русский и локаль всегда одна.
export function formatPrice(
  locale: string,
  price: number | null | undefined,
  onRequest: string,
): string {
  if (price == null) return onRequest;
  return `${price.toLocaleString(locale)} ₫`;
}

// «60 мин» / своя метка услуги («5 часов») / прочерк.
export function formatServiceDuration(
  service: { durationMin: number | null; durationLabel?: string },
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  if (service.durationMin != null) return t("minutes", { count: service.durationMin });
  return service.durationLabel ?? "—";
}
