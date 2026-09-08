// Дефолтный публичный справочник FlyGuru: порядок, цены, картинки и признаки
// услуг. Актуальные цены и длительность подменяются данными БД по services.code
// (см. src/lib/services.ts). При расхождении проверяем исполняемый код и БД.
//
// ТЕКСТОВ здесь нет. Название, описание и приписка живут в messages/<язык>.json
// (раздел Services, ключ = id услуги), потому что сайт говорит на семи языках.
// Подставляет их localizeServices из src/lib/serviceText.ts — публичные
// страницы обязаны прогонять список через него, иначе карточка останется без
// названия.

export type Vnd = number | null;

export type ServiceCategory =
  | "training"
  | "tandem"
  | "rental"
  | "tour"
  | "subscription"
  | "extra";

export interface Service {
  id: string;
  // Тексты подставляет localizeServices (src/lib/serviceText.ts) из messages.
  // В самом справочнике их нет — отсюда «?» у всех четырёх.
  name?: string;
  durationMin: number | null;
  durationLabel?: string; // если длительность не в минутах («полдня», «целый день»)
  price: Vnd; // null = цена не определена (TODO/по запросу)
  category: ServiceCategory;
  membersOnly?: boolean; // выезды: доступ по одобрению инструктора (пак G), не жёсткое членство
  note?: string;
  // Одна фраза о том, что человек получит. Нужна там, где услуга показана
  // карточкой, а не строкой прайса: в карточке под названием остаётся пустое
  // место, и без описания она читается как ценник из таблицы.
  blurb?: string;
  // Круглая иллюстрация услуги (public/media/photo/prices). Часть услуг делит
  // один кадр: у фото/видео с монтажом и без него камера одна и та же.
  image?: string;
}

export const services: Service[] = [
  // ── Обучение ──
  {
    id: "basic-adult",
    durationMin: 60,
    price: 2_000_000,
    category: "training",
    image: "/media/photo/prices/training-solo.webp",
  },
  {
    id: "basic-kid",
    durationMin: 60,
    price: 1_500_000,
    category: "training",
    image: "/media/photo/prices/training-kid.webp",
  },
  {
    id: "individual-training",
    durationMin: 60,
    price: 3_000_000,
    category: "training",
    // Тот же кадр, что у базового: своей иллюстрации у формата нет, и на
    // странице обучения он уже стоит с ней же.
    image: "/media/photo/prices/training-solo.webp",
  },
  {
    id: "basic-duo",
    durationMin: 60,
    price: 3_500_000,
    category: "training",
    image: "/media/photo/prices/training-duo.webp",
  },

  // ── Тандем ──
  {
    id: "tandem-adult",
    durationMin: 10,
    price: 1_000_000,
    category: "tandem",
    image: "/media/photo/prices/tandem-adult.webp",
  },
  {
    id: "tandem-kid",
    durationMin: 10,
    price: 500_000,
    category: "tandem",
    image: "/media/photo/prices/tandem-kid.webp",
  },

  // ── Выезды (только для членов клуба) ──
  {
    id: "excursion",
    durationMin: 120,
    price: 3_500_000,
    category: "tour",
    membersOnly: true,
    image: "/media/photo/prices/excursion.webp",
  },
  {
    id: "safari",
    durationMin: null,
    price: 6_000_000,
    category: "tour",
    membersOnly: true,
    image: "/media/photo/prices/safari.webp",
  },

  // ── Прокат ──
  {
    id: "rental",
    durationMin: 30,
    price: 1_000_000,
    category: "rental",
    image: "/media/photo/prices/rental.webp",
  },

  // ── Абонемент ──
  {
    id: "subscription",
    durationMin: 300,
    price: 6_000_000,
    category: "subscription",
    image: "/media/photo/prices/subscription.webp",
  },

  // ── Доп. услуги ──
  {
    id: "video",
    durationMin: null,
    price: 1_200_000,
    category: "extra",
    image: "/media/photo/prices/video.webp",
  },
  {
    id: "video-raw",
    durationMin: null,
    price: 600_000,
    category: "extra",
    image: "/media/photo/prices/video.webp",
  },
  {
    id: "drone",
    durationMin: 20,
    price: 1_000_000,
    category: "extra",
    image: "/media/photo/prices/drone.webp",
  },
];

export function getService(id: string): Service {
  const s = services.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown service id: ${id}`);
  return s;
}

// «2 000 000 ₫» / «по запросу» для null
export function formatVnd(price: Vnd): string {
  if (price == null) return "по запросу";
  return `${price.toLocaleString("ru-RU")} ₫`;
}

// «60 мин» / кастомная метка / «—»
export function formatDuration(s: Pick<Service, "durationMin" | "durationLabel">): string {
  if (s.durationMin != null) return `${s.durationMin} мин`;
  return s.durationLabel ?? "—";
}

export const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  training: "Обучение",
  tandem: "Тандем",
  tour: "Выезды",
  rental: "Прокат",
  subscription: "Абонемент",
  extra: "Дополнительно",
};
