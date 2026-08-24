// Единый справочник услуг и цен FlyGuru.
// ИСТОЧНИК ПРАВДЫ: docs/flyguru_architecture.md, раздел 3.
// Все цены на страницах и в прайсе берутся отсюда → расхождений быть не может.

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
  name: string;
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
    name: "Базовое обучение (взрослый)",
    durationMin: 60,
    price: 2_000_000,
    category: "training",
    blurb: "Первое знакомство с eFoil под руководством инструктора.",
    image: "/media/photo/prices/training-solo.webp",
  },
  {
    id: "basic-kid",
    name: "Базовое обучение (до 14 лет)",
    durationMin: 60,
    price: 1_500_000,
    category: "training",
    blurb: "Отдельная программа для детей до 14 лет.",
    image: "/media/photo/prices/training-kid.webp",
  },
  {
    id: "individual-training",
    name: "Индивидуальное обучающее занятие",
    durationMin: 60,
    price: 3_000_000,
    category: "training",
    blurb:
      "Инструктор выезжает с вами на воду и точнее контролирует процесс обучения.",
    // Тот же кадр, что у базового: своей иллюстрации у формата нет, и на
    // странице обучения он уже стоит с ней же.
    image: "/media/photo/prices/training-solo.webp",
  },
  {
    id: "basic-duo",
    name: "Парное базовое обучение",
    durationMin: 60,
    price: 3_500_000,
    category: "training",
    blurb: "Совместное обучение для двух человек.",
    image: "/media/photo/prices/training-duo.webp",
  },

  // ── Тандем ──
  {
    id: "tandem-adult",
    name: "Полёт в тандеме (взрослый)",
    durationMin: 10,
    price: 1_000_000,
    category: "tandem",
    blurb: "Инструктор подбирает вас с пирса — и вы уже летите. Обучение не нужно.",
    image: "/media/photo/prices/tandem-adult.webp",
  },
  {
    id: "tandem-kid",
    name: "Полёт в тандеме (до 14 лет)",
    durationMin: 10,
    price: 500_000,
    category: "tandem",
    blurb: "То же самое для ребёнка: он сидит на доске, доской управляет инструктор.",
    image: "/media/photo/prices/tandem-kid.webp",
  },

  // ── Выезды (только для членов клуба) ──
  {
    id: "excursion",
    name: "Экскурсия с инструктором",
    durationMin: 120,
    price: 3_500_000,
    category: "tour",
    membersOnly: true,
    note: "Вдвоём — по 3 000 000 ₫ с человека",
    blurb: "Полёт к острову Черепахи с инструктором — чтобы набрать опыт в открытом море.",
    image: "/media/photo/prices/excursion.webp",
  },
  {
    id: "safari",
    name: "E-Foil Safari",
    durationMin: null,
    durationLabel: "5 часов",
    price: 6_000_000,
    category: "tour",
    membersOnly: true,
    blurb: "Остров Обезьян, резорт и дикий пляж Баунти. Маршрут решаете вместе с гидом.",
    image: "/media/photo/prices/safari.webp",
  },

  // ── Прокат ──
  {
    id: "rental",
    name: "Самостоятельное катание",
    durationMin: 30,
    price: 1_000_000,
    category: "rental",
    blurb: "Катаетесь сами, без инструктора на воде — если уже уверенно едете.",
    image: "/media/photo/prices/rental.webp",
  },

  // ── Абонемент ──
  {
    id: "subscription",
    name: "Абонемент 300 минут",
    durationMin: 300,
    price: 6_000_000,
    category: "subscription",
    blurb: "Пакет минут: катаете когда удобно, минута выходит дешевле разового проката.",
    image: "/media/photo/prices/subscription.webp",
  },

  // ── Доп. услуги ──
  {
    id: "video",
    name: "Фото/видео с монтажом",
    durationMin: null,
    durationLabel: "—",
    price: 1_200_000,
    category: "extra",
    blurb: "Снимаем ваше занятие и собираем готовый ролик.",
    image: "/media/photo/prices/video.webp",
  },
  {
    id: "video-raw",
    name: "Фото/видео без монтажа",
    durationMin: null,
    durationLabel: "—",
    price: 600_000,
    category: "extra",
    blurb: "Те же кадры, но без сборки — исходники отдаём как есть.",
    image: "/media/photo/prices/video.webp",
  },
  {
    id: "drone",
    name: "Съёмка с дрона Hover Aqua Pro",
    durationMin: 20,
    price: 1_000_000,
    category: "extra",
    note: "Одна сессия, исходники отдаём",
    blurb: "Дрон идёт над водой следом за вами и снимает полёт со стороны.",
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
