// Условия агентской ссылки: сколько скидки получает гость и сколько зарабатывает
// агент — по каждой услуге отдельно (решение David от 16.08.2026), а с
// 17.08.2026 ещё и по-разному у разных агентов.
//
// Как это устроено. У агента есть ТАРИФ (agents.terms_plan, миграция 0046) —
// имя набора условий. Сами числа лежат здесь:
//
//   standard — гостю −100 000 ₫ за базовое и −200 000 ₫ за парное,
//              агенту 200 000 ₫ и 300 000 ₫ (условия всех агентов школы)
//   pct-20   — гостю −5%, агенту 20% с чека (личная договорённость начальника
//              с одним партнёром)
//   variant-1 — с 24.10.2026: клиенту −300 000 ₫ на базовое, парное и
//              абонемент, агенту 200 000 / 300 000 / 600 000 ₫, и только за
//              нового клиента. Следующему агенту на своих условиях — свой
//              «Вариант 2» рядом.
//
// Проценты считаются от ФАКТИЧЕСКОГО чека: сперва гостю снимают скидку, и уже с
// того, что человек реально заплатил, агенту идут 20%. Если админ вписал сумму
// занятия руками — 20% берутся с неё же.
//
// Детское базовое (basic-kid) в таблицах отсутствует намеренно: по нему ни
// скидки, ни награды нет ни на одном тарифе. Всё остальное — тандемы, прокат,
// экскурсии — гость по агентской ссылке записать может (список услуг в форме
// полный), но по обычной цене и без заработка агенту.
//
// ЭТОТ ФАЙЛ ЧИТАЮТ И СЕРВЕР, И БРАУЗЕР. Поэтому здесь только числа и чистые
// функции: ни базы, ни supabase-клиентов. Правило «кому скидка положена»
// (первое обучение, живой агент) живёт в lib/agentReward — оно требует базы.

/** Имя тарифа. Ровно эти значения разрешает check в базе (0046, 0072). */
export type AgentPlan = "standard" | "pct-20" | "variant-1";

/** Тариф агентов школы: на нём считаем, если тариф неизвестен или не задан. */
export const DEFAULT_AGENT_PLAN: AgentPlan = "standard";

/** Что предлагает форма «Новый агент» (с 24.10.2026 агенты идут на «Варианте 1»). */
export const NEW_AGENT_PLAN: AgentPlan = "variant-1";

/** Фиксированные суммы в донгах. */
interface FixedTerms {
  discount: number; // сколько снимаем с цены услуги
  commission: number; // сколько получает агент за такую запись
  // Сколько снять с чека, прежде чем считать 35% Marina, 15% и 2% CRM. Не
  // задано — ровно комиссия агента (так у всех занятий). У абонемента
  // «Варианта 1» договорились иначе: «Марине с 5 млн» при чеке 5,7 млн.
  baseCut?: number;
}

/** Доли от чека в процентах. */
interface PercentTerms {
  discountPct: number; // сколько процентов скидки гостю
  commissionPct: number; // сколько процентов чека получает агент
}

export type AgentServiceTerms = FixedTerms | PercentTerms;

function isPercent(terms: AgentServiceTerms): terms is PercentTerms {
  return "commissionPct" in terms;
}

interface AgentPlanDef {
  /** Как тариф называется в кабинете (выпадающий список у карточки агента). */
  label: string;
  /** Одна строка «что кому», её же видит админ в карточке. */
  note: string;
  /** Услуга (services.code) → условия. */
  services: Readonly<Record<string, AgentServiceTerms>>;
  /**
   * Платим только за нового клиента — того, кто раньше у нас ничего не
   * покупал (ни занятия, ни абонемента). Без флага действует старое правило:
   * за первое базовое обучение (lib/agentReward).
   */
  newClientsOnly?: boolean;
}

/**
 * Все тарифы школы. Единственный источник этих чисел: и расчёт при оформлении,
 * и подписи на сайте берут их отсюда, чтобы цифра в обещании гостю и цифра в
 * кассе не разъезжались.
 */
export const AGENT_PLANS: Readonly<Record<AgentPlan, AgentPlanDef>> = {
  standard: {
    label: "Стандартные условия",
    note: "гостю −100 000 ₫ (базовое) и −200 000 ₫ (парное), агенту 200 000 ₫ и 300 000 ₫",
    services: {
      "basic-adult": { discount: 100_000, commission: 200_000 },
      "basic-duo": { discount: 200_000, commission: 300_000 },
    },
  },
  "pct-20": {
    label: "20% агенту, −5% гостю",
    note: "гостю −5% на базовое и парное, агенту 20% с чека",
    services: {
      "basic-adult": { discountPct: 5, commissionPct: 20 },
      "basic-duo": { discountPct: 5, commissionPct: 20 },
    },
  },
  "variant-1": {
    label: "Вариант 1",
    note: "клиенту −300 000 ₫ на базовое, парное и абонемент; агенту 200 000 / 300 000 / 600 000 ₫; только новые клиенты",
    services: {
      "basic-adult": { discount: 300_000, commission: 200_000 },
      "basic-duo": { discount: 300_000, commission: 300_000 },
      // 600 000 = 10% от полной цены 6 млн, а проценты школы — с 5 млн.
      subscription: { discount: 300_000, commission: 600_000, baseCut: 700_000 },
    },
    newClientsOnly: true,
  },
};

/**
 * Проверка значения, пришедшего из базы или из формы. Незнакомый тариф — это
 * либо код старее базы, либо подделанная форма: в обоих случаях считаем по
 * стандартным условиям, а не по случайным числам.
 */
export function asAgentPlan(value: unknown): AgentPlan {
  return typeof value === "string" && value in AGENT_PLANS
    ? (value as AgentPlan)
    : DEFAULT_AGENT_PLAN;
}

/** Коды услуг, по которым агентская ссылка на этом тарифе что-то даёт. */
export function agentRewardedCodes(plan: AgentPlan = DEFAULT_AGENT_PLAN): string[] {
  return Object.keys(AGENT_PLANS[plan].services);
}

/** Есть ли у услуги агентские условия (скидка гостю + награда агенту). */
export function hasAgentTerms(
  code: string | null | undefined,
  plan: AgentPlan = DEFAULT_AGENT_PLAN,
): boolean {
  return Boolean(code) && code! in AGENT_PLANS[plan].services;
}

function termsFor(
  code: string | null | undefined,
  plan: AgentPlan,
): AgentServiceTerms | null {
  return code ? (AGENT_PLANS[plan].services[code] ?? null) : null;
}

/**
 * Донги округляем до тысяч: в кассе школы нет монет, и «379 999 ₫» в награде
 * агенту выглядело бы опечаткой. Округление вверх/вниз по обычному правилу.
 */
function roundVnd(value: number): number {
  return Math.max(0, Math.round(value / 1000) * 1000);
}

/**
 * Скидка гостю по этой услуге; 0 — скидки нет.
 *
 * price нужен процентным тарифам: 5% без цены не посчитать. У фиксированных
 * тарифов он не влияет ни на что, поэтому места вызова могут спокойно
 * передавать цену «как есть», даже когда её нет (null → скидки нет).
 */
export function agentDiscountFor(
  code: string | null | undefined,
  price: number | null | undefined,
  plan: AgentPlan = DEFAULT_AGENT_PLAN,
): number {
  const terms = termsFor(code, plan);
  if (!terms) return 0;
  if (!isPercent(terms)) return terms.discount;
  if (price === null || price === undefined) return 0;
  return roundVnd((price * terms.discountPct) / 100);
}

/**
 * Награда агенту за такую запись; 0 — агент на ней не зарабатывает.
 *
 * amount — ЧЕК, то есть сколько гость реально заплатил (уже со скидкой и с
 * учётом суммы, вписанной админом руками). Именно с него договорены 20%.
 */
export function agentCommissionFor(
  code: string | null | undefined,
  amount: number | null | undefined,
  plan: AgentPlan = DEFAULT_AGENT_PLAN,
): number {
  const terms = termsFor(code, plan);
  if (!terms) return 0;
  if (!isPercent(terms)) return terms.commission;
  if (amount === null || amount === undefined) return 0;
  return roundVnd((amount * terms.commissionPct) / 100);
}

/**
 * Сколько снять с чека перед процентами школы (35% Marina, 15%, 2% CRM).
 * Обычно это и есть комиссия агента; у абонемента «Варианта 1» — больше.
 * Вызывать только там, где награда агенту положена: иначе вычитать нечего.
 */
export function agentBaseCutFor(
  code: string | null | undefined,
  amount: number | null | undefined,
  plan: AgentPlan = DEFAULT_AGENT_PLAN,
): number {
  const terms = termsFor(code, plan);
  if (terms && !isPercent(terms) && terms.baseCut !== undefined) return terms.baseCut;
  return agentCommissionFor(code, amount, plan);
}

/**
 * Чек со скидкой. discounted приходит снаружи: скидка даётся только за ПЕРВОЕ
 * базовое обучение гостя и только по ссылке живого агента — это решает
 * lib/agentReward, здесь мы просто вычитаем нужную сумму.
 *
 * Ниже нуля чек не опускаем: цену услуги в базе могут поставить меньше скидки,
 * и отрицательный чек уехал бы в выручку, ЗП и долю площадки.
 */
export function applyRefDiscount(
  price: number,
  serviceCode: string | null | undefined,
  discounted: boolean,
  plan: AgentPlan = DEFAULT_AGENT_PLAN,
): number {
  if (!discounted) return price;
  return Math.max(0, price - agentDiscountFor(serviceCode, price, plan));
}
