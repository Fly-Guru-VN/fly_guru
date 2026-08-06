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
}

export const services: Service[] = [
  // ── Обучение ──
  { id: "basic-adult", name: "Базовое обучение (взрослый)", durationMin: 60, price: 2_000_000, category: "training" },
  { id: "basic-kid", name: "Базовое обучение (до 14 лет)", durationMin: 60, price: 1_500_000, category: "training" },
  { id: "individual-training", name: "Индивидуальное обучающее занятие", durationMin: 60, price: 3_000_000, category: "training" },
  { id: "basic-duo", name: "Парное базовое обучение", durationMin: 60, price: 3_500_000, category: "training" },

  // ── Тандем ──
  { id: "tandem-adult", name: "Полёт в тандеме (взрослый)", durationMin: 10, price: 1_000_000, category: "tandem" },
  { id: "tandem-kid", name: "Полёт в тандеме (до 14 лет)", durationMin: 10, price: 500_000, category: "tandem" },

  // ── Выезды (только для членов клуба) ──
  {
    id: "excursion",
    name: "Экскурсия с инструктором",
    durationMin: 120,
    price: 3_500_000,
    category: "tour",
    membersOnly: true,
    note: "Вдвоём — по 3 000 000 ₫ с человека",
  },
  {
    id: "safari",
    name: "E-Foil Safari",
    durationMin: null,
    durationLabel: "5 часов",
    price: 6_000_000,
    category: "tour",
    membersOnly: true,
  },

  // ── Прокат ──
  { id: "rental", name: "Самостоятельное катание", durationMin: 30, price: 1_000_000, category: "rental" },

  // ── Абонемент ──
  { id: "subscription", name: "Абонемент 300 минут", durationMin: 300, price: 6_000_000, category: "subscription" },

  // ── Доп. услуги ──
  { id: "video", name: "Фото/видео с монтажом", durationMin: null, durationLabel: "—", price: 1_200_000, category: "extra" },
  { id: "video-raw", name: "Фото/видео без монтажа", durationMin: null, durationLabel: "—", price: 600_000, category: "extra" },
  {
    id: "drone",
    name: "Съёмка с дрона Hover Aqua Pro",
    durationMin: 20,
    price: 1_000_000,
    category: "extra",
    note: "Одна сессия, исходники отдаём",
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
