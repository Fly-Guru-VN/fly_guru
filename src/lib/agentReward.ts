import type { createClient } from "@/lib/supabase/server";
import type { createAdminClient } from "@/lib/supabase/admin";
import { phonesMatch } from "@/lib/phone";
import { loadAllClients } from "@/lib/clients";
import { hasAgentTerms, DEFAULT_AGENT_PLAN, type AgentPlan } from "@/lib/agentTerms";

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
  return !(await hasEarlierBasicTraining(supabase, clientId));
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
  agentCommissionFor,
  agentDiscountFor,
  asAgentPlan,
  DEFAULT_AGENT_PLAN,
  type AgentPlan,
} from "@/lib/agentTerms";
