// Условия агентской ссылки: сколько скидки получает гость и сколько зарабатывает
// агент — по каждой услуге отдельно (решение David от 16.08.2026).
//
// Раньше правило было одно на всех: −10% гостю и фиксированные 300 000 ₫ агенту
// из карточки агента (agents.commission_fixed). Теперь суммы разные и зависят
// от того, на что человек записался:
//
//   базовое обучение (взрослое) — гостю −100 000 ₫, агенту 200 000 ₫
//   парное базовое обучение     — гостю −200 000 ₫, агенту 300 000 ₫
//
// Детское базовое (basic-kid) в таблице отсутствует намеренно: по нему ни
// скидки, ни награды нет. Всё остальное — тандемы, прокат, экскурсии — гость по
// агентской ссылке записать может (список услуг в форме полный), но по обычной
// цене и без заработка агенту.
//
// ЭТОТ ФАЙЛ ЧИТАЮТ И СЕРВЕР, И БРАУЗЕР. Поэтому здесь только числа и чистые
// функции: ни базы, ни supabase-клиентов. Правило «кому скидка положена»
// (первое обучение, живой агент) живёт в lib/agentReward — оно требует базы.

export interface AgentServiceTerms {
  discount: number; // сколько снимаем с цены услуги
  commission: number; // сколько получает агент за такую запись
}

/**
 * Услуга (services.code) → условия. Единственный источник этих сумм: и расчёт
 * при оформлении, и подписи на сайте берут их отсюда, чтобы цифра в обещании
 * гостю и цифра в кассе не разъезжались.
 */
export const AGENT_SERVICE_TERMS: Readonly<Record<string, AgentServiceTerms>> = {
  "basic-adult": { discount: 100_000, commission: 200_000 },
  "basic-duo": { discount: 200_000, commission: 300_000 },
};

/** Коды услуг, по которым агентская ссылка вообще что-то даёт. */
export const AGENT_REWARDED_CODES = Object.keys(AGENT_SERVICE_TERMS);

/** Есть ли у услуги агентские условия (скидка гостю + награда агенту). */
export function hasAgentTerms(code: string | null | undefined): boolean {
  return Boolean(code) && code! in AGENT_SERVICE_TERMS;
}

/** Скидка гостю по этой услуге; 0 — скидки нет. */
export function agentDiscountFor(code: string | null | undefined): number {
  return code ? (AGENT_SERVICE_TERMS[code]?.discount ?? 0) : 0;
}

/** Награда агенту за такую запись; 0 — агент на ней не зарабатывает. */
export function agentCommissionFor(code: string | null | undefined): number {
  return code ? (AGENT_SERVICE_TERMS[code]?.commission ?? 0) : 0;
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
): number {
  if (!discounted) return price;
  return Math.max(0, price - agentDiscountFor(serviceCode));
}
