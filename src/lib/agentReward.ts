import type { createClient } from "@/lib/supabase/server";
import type { createAdminClient } from "@/lib/supabase/admin";
import { phonesMatch } from "@/lib/phone";
import { loadAllClients } from "@/lib/clients";
import {
  AGENT_PLANS,
  agentBaseCutFor,
  agentCommissionFor,
  applyRefDiscount,
  asAgentPlan,
  hasAgentTerms,
  DEFAULT_AGENT_PLAN,
  type AgentPlan,
} from "@/lib/agentTerms";

// Когда агент зарабатывает на приведённом клиенте (пачка правок №6, п.5).
//
// Правило школы, дословно от начальника: агенту платим ТОЛЬКО за то, что
// человек впервые сел на фойл у нас — то есть за первое базовое обучение
// (в том числе парное). Всё остальное — тандемы, прокат, экскурсии, повторные
// занятия того же гостя — агент уже не приводит, он их просто сопровождает.
//
// Раньше награда писалась при любом занятии с агентским кодом. Клиент,
// пришедший второй раз с тем же телефоном, начислял агенту ещё 300 000 ₫ —
// именно так у одного гостя оказалось две награды подряд.
//
// Скидка живёт по тому же правилу: она даётся вместе с наградой, за первое
// базовое обучение. Второй раз по той же ссылке — уже без скидки. Сами суммы
// (сколько скидки и сколько агенту) зависят от услуги и лежат в lib/agentTerms.

// Сайтовый роут заявок ходит service_role клиентом (гость не залогинен),
// кабинеты — обычным: правило одно, клиент разный.
type Supabase =
  | Awaited<ReturnType<typeof createClient>>
  | ReturnType<typeof createAdminClient>;

/**
 * Что считается «уже катался у нас»: любое базовое обучение, включая детское.
 * Этот список шире, чем список оплачиваемых агенту услуг (lib/agentTerms): за
 * детское занятие агент не получает ничего, но человек, прошедший его, — уже не
 * новичок, и второй раз скидка по агентской ссылке ему не положена.
 */
export const BASIC_TRAINING_CODES = ["basic-adult", "basic-kid", "basic-duo"];

/**
 * Катался ли клиент у нас на базовом обучении раньше. Смотрим уже записанные
 * сессии: если хоть одна базовая есть — это не первый раз, награда не
 * положена. Считаем ДО вставки новой сессии, иначе она найдёт саму себя.
 *
 * Ошибку запроса трактуем как «катался» — не начислить лишнего важнее, чем
 * не начислить положенное: пропущенную награду админ добавит руками, а лишние
 * деньги агенту уже уехали.
 */
async function hasEarlierBasicTraining(
  supabase: Supabase,
  clientId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("sessions")
    .select("id, services!inner(code)")
    .eq("client_id", clientId)
    .in("services.code", BASIC_TRAINING_CODES)
    .limit(1);
  if (error) {
    console.error("[agentReward] previous training check failed:", error.message);
    return true;
  }
  return (data ?? []).length > 0;
}

/**
 * Покупал ли клиент у нас хоть что-то: занятие любого вида или абонемент.
 * Правило тарифов с newClientsOnly («Вариант 1», 24.10.2026): агенту платим
 * только за нового клиента. Ошибку запроса трактуем как «покупал» — по той же
 * причине, что и выше.
 */
async function hasEarlierPurchase(
  supabase: Supabase,
  clientId: string,
): Promise<boolean> {
  const [sessions, subs] = await Promise.all([
    supabase.from("sessions").select("id").eq("client_id", clientId).limit(1),
    supabase.from("subscriptions").select("id").eq("client_id", clientId).limit(1),
  ]);
  const error = sessions.error ?? subs.error;
  if (error) {
    console.error("[agentReward] previous purchase check failed:", error.message);
    return true;
  }
  return (sessions.data ?? []).length > 0 || (subs.data ?? []).length > 0;
}

/**
 * Итог для одного оформления: положены ли агенту награда и комиссия, а
 * клиенту — скидка. Всё это одно и то же событие, поэтому и решение одно.
 *
 * Услуги без агентских условий (детское базовое, тандем, прокат) отсекаются
 * сразу: записаться по агентской ссылке на них можно, но денег это никому не
 * приносит и чек остаётся полным.
 */
export async function agentRewardApplies(
  supabase: Supabase,
  {
    hasAgent,
    serviceCode,
    clientId,
    plan = DEFAULT_AGENT_PLAN,
  }: {
    hasAgent: boolean;
    serviceCode: string | null | undefined;
    clientId: string;
    /** Тариф агента (agents.terms_plan): от него зависит список услуг. */
    plan?: AgentPlan;
  },
): Promise<boolean> {
  if (!hasAgent || !hasAgentTerms(serviceCode, plan)) return false;
  if (AGENT_PLANS[plan].newClientsOnly) {
    return !(await hasEarlierPurchase(supabase, clientId));
  }
  return !(await hasEarlierBasicTraining(supabase, clientId));
}

/**
 * Живой агент по реф-коду заявки. null — кода нет, агент выключен или это
 * ссылка члена клуба. Нужен продаже абонемента: у занятий тот же запрос
 * исторически написан на месте.
 */
export async function activeAgentByCode(
  supabase: Supabase,
  refCode: string | null | undefined,
): Promise<{ id: string; plan: AgentPlan } | null> {
  if (!refCode) return null;
  const { data, error } = await supabase
    .from("agents")
    .select("id, terms_plan")
    .eq("ref_code", refCode)
    .eq("active", true)
    .maybeSingle();
  if (error) console.error("[agentReward] agent lookup failed:", error.message);
  return data ? { id: data.id as string, plan: asAgentPlan(data.terms_plan) } : null;
}

/** services.code абонемента — ключ условий агента на нём. */
export const SUBSCRIPTION_CODE = "subscription";

/** Что агентская ссылка меняет в продаже абонемента. */
export interface AgentSubscriptionDeal {
  /** Агенту положена награда (тариф её даёт, клиент новый). */
  rewarded: boolean;
  /** Итоговая цена абонемента. */
  price: number;
  /** Сколько должны агенту (subscriptions.agent_commission). */
  commission: number;
  /** Сколько снять с цены перед процентами школы (subscriptions.agent_base_cut). */
  baseCut: number;
}

/**
 * Продажа абонемента по ссылке агента («Вариант 1», 24.10.2026): клиенту
 * −300 000 ₫, агенту 600 000 ₫, проценты школы с цены минус 700 000 ₫.
 *
 * Своя цена босса окончательная: скидку на неё не накладываем, но агенту всё
 * равно 600 000 — «не важно каким образом продан» (David, 24.10.2026). Вызывать
 * ДО вставки абонемента: иначе проверка «новый ли клиент» найдёт его самого.
 */
export async function agentSubscriptionDeal(
  supabase: Supabase,
  {
    agent,
    clientId,
    listPrice,
    customPrice,
  }: {
    agent: { id: string; plan: AgentPlan } | null;
    clientId: string;
    /** Цена без агента: 6 млн (члену клуба 5 млн, lib/subscriptionPrice). */
    listPrice: number;
    /** Своя цена босса; null — не ставил. */
    customPrice: number | null;
  },
): Promise<AgentSubscriptionDeal> {
  const plan = agent?.plan ?? DEFAULT_AGENT_PLAN;
  const rewarded = await agentRewardApplies(supabase, {
    hasAgent: Boolean(agent),
    serviceCode: SUBSCRIPTION_CODE,
    clientId,
    plan,
  });
  const price = customPrice ?? applyRefDiscount(listPrice, SUBSCRIPTION_CODE, rewarded, plan);
  if (!rewarded) return { rewarded, price, commission: 0, baseCut: 0 };
  return {
    rewarded,
    price,
    commission: agentCommissionFor(SUBSCRIPTION_CODE, price, plan),
    baseCut: agentBaseCutFor(SUBSCRIPTION_CODE, price, plan),
  };
}

/**
 * Награда агенту за проданный абонемент. Оплачен — сразу заработана датой
 * оплаты; в долг — ждёт «Отметить оплату» (confirmAgentReward). Ошибку не
 * кидаем: абонемент уже создан, и «не сохранилось» толкнуло бы продать его
 * второй раз. Пропущенную награду админ увидит по пустой истории агента.
 */
export async function grantAgentSubscriptionReward(
  supabase: Supabase,
  {
    agentId,
    clientId,
    commission,
    paidAt,
  }: { agentId: string; clientId: string; commission: number; paidAt: string | null },
): Promise<void> {
  const { error } = await supabase.from("referral_rewards").insert({
    referrer_type: "agent",
    referrer_id: agentId,
    client_id: clientId,
    reward_type: "money",
    amount: commission,
    status: paidAt ? "confirmed" : "pending",
    confirmed_at: paidAt,
  });
  if (error) console.error("[agentReward] subscription reward insert error:", error.message);
}

/**
 * Подсказка над формой продажи абонемента из заявки по ссылке агента: чтобы
 * продавец не удивлялся цене 5,7 млн вместо 6. null — ссылка не агентская или
 * тариф агента абонемента не касается.
 */
export async function agentSubscriptionNote(
  supabase: Supabase,
  refCode: string | null | undefined,
  listPrice: number,
): Promise<string | null> {
  const agent = await activeAgentByCode(supabase, refCode);
  if (!agent || !hasAgentTerms(SUBSCRIPTION_CODE, agent.plan)) return null;
  const discount = listPrice - applyRefDiscount(listPrice, SUBSCRIPTION_CODE, true, agent.plan);
  const rule = AGENT_PLANS[agent.plan].newClientsOnly
    ? "если клиент у нас ничего раньше не покупал"
    : "если клиент ещё не учился у нас";
  return `Заявка по ссылке агента: скидка ${discount.toLocaleString("ru-RU")} ₫ ${rule} — сервер поставит её сам.`;
}

/**
 * Абонемент агента отменили или удалили — награда за него не заработана.
 * Награда привязана к клиенту, а не к абонементу (как и у занятий, см.
 * removeSessionReward в admin/actions): ищем по клиенту и сумме. Клиент у
 * агента новый, поэтому подходящая строка одна.
 */
export async function removeAgentSubscriptionReward(
  supabase: Supabase,
  sub: { client_id?: string | null; agent_commission?: number | null } | null,
): Promise<void> {
  const commission = Number(sub?.agent_commission ?? 0);
  if (!sub?.client_id || commission <= 0) return;
  const { error } = await supabase
    .from("referral_rewards")
    .delete()
    .eq("referrer_type", "agent")
    .eq("client_id", sub.client_id)
    .eq("amount", commission);
  if (error) console.error("[agentReward] subscription reward delete error:", error.message);
}

/**
 * Абонемент, проданный в долг, оплатили: награда агента за него (pending)
 * становится заработанной датой оплаты — как выручка этого абонемента.
 */
export async function confirmAgentReward(
  supabase: Supabase,
  clientId: string,
  paidAt: string,
): Promise<void> {
  const { error } = await supabase
    .from("referral_rewards")
    .update({ status: "confirmed", confirmed_at: paidAt })
    .eq("referrer_type", "agent")
    .eq("client_id", clientId)
    .eq("status", "pending");
  if (error) console.error("[agentReward] reward confirm error:", error.message);
}

/**
 * То же правило, но ДО оформления, когда клиента ещё не опознали: на руках
 * только телефон из заявки. Нужно интерфейсу — карточка заявки и форма записи
 * обещали скидку любому, кто пришёл по ссылке агента, хотя второй раз скидки
 * уже не будет (пачка №6, п.5 закрыла расчёт, но не подписи).
 *
 * Возвращает по телефону: true — гость на скидку претендует (в базе его нет
 * или базового обучения у него не было), false — уже проходил обучение.
 * Телефоны, которые не удалось проверить, в карту просто не попадают — тогда
 * интерфейс не обещает ничего, вместо того чтобы соврать в любую сторону.
 *
 * Два запроса на всю страницу, а не по паре на карточку: клиентов и их базовые
 * сессии забираем пачкой, дальше сверяем телефоны в памяти (`phonesMatch` —
 * тот же матчер, что при оформлении, ищет по последним 9 цифрам).
 */
export async function firstBasicTrainingByPhone(
  supabase: Supabase,
  phones: (string | null | undefined)[],
): Promise<Map<string, boolean>> {
  const wanted = [...new Set(phones.filter(Boolean) as string[])];
  const result = new Map<string, boolean>();
  if (wanted.length === 0) return result;

  const { rows: clients, error } = await loadAllClients<{
    id: string;
    phone: string | null;
  }>(supabase, "id, phone", { onlyWithPhone: true });
  if (error) {
    console.error("[agentReward] clients load failed:", error);
    return result; // не знаем — значит молчим
  }

  // Телефон → карточка клиента. Незнакомый номер = новый гость, скидка положена.
  const matched = new Map<string, string>();
  for (const phone of wanted) {
    const hit = clients.find((c) => phonesMatch(c.phone as string, phone));
    if (hit) matched.set(phone, hit.id as string);
    else result.set(phone, true);
  }
  if (matched.size === 0) return result;

  const ids = [...new Set(matched.values())];
  const { data: trained, error: sesError } = await supabase
    .from("sessions")
    .select("client_id, services!inner(code)")
    .in("client_id", ids)
    .in("services.code", BASIC_TRAINING_CODES);
  if (sesError) {
    console.error("[agentReward] previous trainings load failed:", sesError.message);
    return result;
  }
  const trainedIds = new Set((trained ?? []).map((s) => s.client_id as string));
  for (const [phone, clientId] of matched) {
    result.set(phone, !trainedIds.has(clientId));
  }
  return result;
}

// Суммы скидки и комиссии — в lib/agentTerms (их читает и браузер). Здесь
// пробрасываем их дальше, чтобы место оформления импортировало один модуль.
export {
  applyRefDiscount,
  agentBaseCutFor,
  agentCommissionFor,
  agentDiscountFor,
  DEFAULT_AGENT_PLAN,
  type AgentPlan,
} from "@/lib/agentTerms";
export { asAgentPlan };
