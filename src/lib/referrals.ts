import type { createAdminClient } from "@/lib/supabase/admin";
import { failIfReadError } from "@/lib/dbError";
import {
  FRIEND_BONUS_MINUTES,
  FRIEND_BONUS_NOTE,
  REFERRER_REWARD_MINUTES,
} from "@/lib/referralTerms";
import { resolveRefOwners } from "@/lib/refOwner";

// Рефералы — клиенты, которые приглашают друзей (миграция 0063). Условия
// словами и числа — в lib/referralTerms, здесь правила, которым нужна база.
//
// Как это устроено:
//   • ссылку получает только член клуба (строка в memberships);
//   • друг, пришедший по ссылке, заводится карточкой с referrer_type 'member'
//     и referrer_id = карточка пригласившего. «Новый клиент» = карточка
//     создана именно этой записью: у того, кто уже был в базе, пригласившего
//     не появится, и награды за него не будет;
//   • награда пишется в referral_rewards (reward_type 'minutes'), когда друг
//     ОПЛАТИЛ первое занятие или абонемент. Не на заявке: пустыми заявками
//     минуты не накрутить. Одну награду за друга держит уникальный индекс;
//   • остаток и списание — функции базы bonus_minutes_left и
//     write_off_bonus_minutes, чтобы формула была одна.
//
// Всё здесь — только service_role: карточки клиентов с телефонами наружу не
// отдаются, а клиент в Telegram-кабинете приходит без сессии Supabase.

type Admin = ReturnType<typeof createAdminClient>;

// Код 6 символов без похожих знаков (0/O, 1/l) — его диктуют вслух. Формат тот
// же, что у кабинетов агента и инструктора, но источник случайности —
// crypto.getRandomValues, как у сертификатов: последовательность Math.random
// восстанавливается по нескольким выданным кодам. Смещение от остатка деления
// (256 % 31) для кода, который и так раздают друзьям, не важно.
const REF_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
function randomRefCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => REF_ALPHABET[b % REF_ALPHABET.length]).join("");
}

/** Член клуба = есть строка в memberships (её заводит откатанный абонемент, 0061). */
export async function isClubMember(admin: Admin, clientId: string): Promise<boolean> {
  const { data, error } = await admin
    .from("memberships")
    .select("id")
    .eq("client_id", clientId)
    .maybeSingle();
  failIfReadError(error, "не удалось проверить членство в клубе");
  return Boolean(data);
}

/**
 * Реф-код клиента. Нет кода — выдаём, но только члену клуба; не член клуба —
 * null. Код пишется условием «если ещё пуст»: двойное открытие вкладки не
 * перезапишет уже разосланную друзьям ссылку.
 */
export async function getOrCreateClientRefCode(
  admin: Admin,
  clientId: string,
): Promise<string | null> {
  const { data: client, error } = await admin
    .from("clients")
    .select("ref_code")
    .eq("id", clientId)
    .maybeSingle();
  failIfReadError(error, "не удалось прочитать реф-код клиента");
  if (client?.ref_code) return client.ref_code as string;
  if (!(await isClubMember(admin, clientId))) return null;

  // Совпадение кода с чужим — редкость (31^6 ≈ 900 млн), но уникальный индекс
  // его всё равно отобьёт; тогда просто пробуем другой.
  for (let attempt = 0; attempt < 5; attempt++) {
    const { error: updError } = await admin
      .from("clients")
      .update({ ref_code: randomRefCode() })
      .eq("id", clientId)
      .is("ref_code", null);
    if (updError && updError.code !== "23505") {
      console.error("[referrals] ref code update error:", updError.message);
      throw new Error("не удалось выдать реф-код");
    }
    if (!updError) break;
  }
  const { data: after, error: readError } = await admin
    .from("clients")
    .select("ref_code")
    .eq("id", clientId)
    .maybeSingle();
  failIfReadError(readError, "не удалось прочитать реф-код клиента");
  return (after?.ref_code as string | null) ?? null;
}

/**
 * Реф-код заявки → карточка пригласившего члена клуба, или null. Старшинство
 * кодов то же, что везде (агент, инструктор, клиент — lib/refOwner).
 *
 * Сбой чтения не роняет оформление: занятие и оплата важнее минут. Потерянную
 * награду видно — в логе и по тому, что у друга нет пригласившего.
 */
export async function memberReferrerFor(
  admin: Admin,
  refCode: string | null | undefined,
): Promise<string | null> {
  if (!refCode) return null;
  try {
    const owner = (await resolveRefOwners(admin, [refCode])).get(refCode);
    return owner?.kind === "client" && owner.active && owner.clientId ? owner.clientId : null;
  } catch (e) {
    console.error("[referrals] ref owner lookup failed:", e);
    return null;
  }
}

/** Остаток бонусных минут (функция базы, 0063). */
export async function bonusMinutesLeft(admin: Admin, clientId: string): Promise<number> {
  const { data, error } = await admin.rpc("bonus_minutes_left", { p_client_id: clientId });
  failIfReadError(error, "не удалось посчитать бонусные минуты");
  return Number(data ?? 0);
}

/**
 * Начислить пригласившему минуты за этого клиента, если он пришёл по ссылке
 * члена клуба. Вызывать, когда клиент ОПЛАТИЛ: занятие записано или абонемент
 * отмечен оплаченным. Повторный вызов безопасен — вторую строку не пустит
 * уникальный индекс, это не ошибка.
 *
 * Ошибку не бросаем: оплата уже записана, и ронять из-за минут оформление
 * нельзя. Пропущенную награду видно — у друга в карточке пригласивший есть, а
 * в кабинете пригласившего он «ещё не оплатил».
 */
export async function grantReferralReward(
  admin: Admin,
  referredClientId: string,
): Promise<boolean> {
  const { data: client, error } = await admin
    .from("clients")
    .select("referrer_type, referrer_id")
    .eq("id", referredClientId)
    .maybeSingle();
  if (error) {
    console.error("[referrals] referred client read error:", error.message);
    return false;
  }
  if (client?.referrer_type !== "member" || !client.referrer_id) return false;
  // Себя пригласить нельзя: карточка друга создаётся новой, но проверим явно.
  if (client.referrer_id === referredClientId) return false;

  const { error: insError } = await admin.from("referral_rewards").insert({
    referrer_type: "member",
    referrer_id: client.referrer_id,
    client_id: referredClientId,
    reward_type: "minutes",
    amount: REFERRER_REWARD_MINUTES,
    status: "confirmed",
    confirmed_at: new Date().toISOString(),
  });
  if (insError) {
    if (insError.code !== "23505") {
      console.error("[referrals] reward insert error:", insError.message);
    }
    return false;
  }
  return true;
}

/**
 * +10 минут приглашённому к только что проданному абонементу. Пишем
 * поправкой (subscription_adjustments) с комментарием: остаток её учитывает,
 * в истории абонемента видно, откуда минуты. Стандартные 300 не трогаем.
 * Абонемент уже продан, поэтому сбой только логируем — минуты админ добавит.
 */
export async function addFriendBonusMinutes(
  admin: Admin,
  subscriptionId: string,
  actorId: string,
): Promise<void> {
  const { error } = await admin.from("subscription_adjustments").insert({
    subscription_id: subscriptionId,
    delta_minutes: FRIEND_BONUS_MINUTES,
    comment: FRIEND_BONUS_NOTE,
    created_by: actorId,
  });
  if (error) console.error("[referrals] friend bonus insert error:", error.message);
}

export interface InvitedFriend {
  name: string;
  /** Когда карточка друга появилась у нас. */
  since: string;
  /** Оплатил ли он первое занятие (то есть начислены ли за него минуты). */
  rewarded: boolean;
}

/**
 * Кого клиент пригласил — для его вкладки в кабинете. Наружу только имя и
 * дата: телефон друга пригласившему не нужен.
 */
export async function loadInvitedFriends(
  admin: Admin,
  referrerId: string,
): Promise<InvitedFriend[]> {
  const [friendsRes, rewardsRes] = await Promise.all([
    admin
      .from("clients")
      .select("id, name, created_at")
      .eq("referrer_type", "member")
      .eq("referrer_id", referrerId)
      .order("created_at", { ascending: false })
      .limit(100),
    admin
      .from("referral_rewards")
      .select("client_id")
      .eq("referrer_type", "member")
      .eq("referrer_id", referrerId),
  ]);
  failIfReadError(friendsRes.error, "не удалось прочитать приглашённых");
  failIfReadError(rewardsRes.error, "не удалось прочитать награды за приглашения");
  const rewarded = new Set((rewardsRes.data ?? []).map((r) => r.client_id as string));
  return (friendsRes.data ?? []).map((f) => ({
    name: (f.name as string | null) ?? "Гость",
    since: f.created_at as string,
    rewarded: rewarded.has(f.id as string),
  }));
}

/**
 * Потратить бонусные минуты — запись с услугой «Бонусные минуты». Проверка
 * остатка и запись идут одной функцией базы под блокировкой по клиенту.
 * Вызывать только после проверки активного сотрудника; actorId — из сессии.
 */
export async function writeOffBonusMinutes(
  admin: Admin,
  input: {
    clientId: string;
    minutes: number;
    date: string;
    instructorId: string | null;
    actorId: string;
    note: string | null;
  },
): Promise<{ left: number; sessionId: string; error: null } | { error: string }> {
  if (!Number.isSafeInteger(input.minutes) || input.minutes <= 0 || input.minutes > 2147483647) {
    return { error: "Минуты — целое число больше нуля в допустимом диапазоне." };
  }
  const { data, error } = await admin.rpc("write_off_bonus_minutes", {
    p_client_id: input.clientId,
    p_minutes: input.minutes,
    p_date: input.date,
    p_instructor_id: input.instructorId,
    p_actor_id: input.actorId,
    p_note: input.note,
  });
  if (error) return { error: `Не удалось списать: ${error.message}` };
  const left = Number(data?.[0]?.left_minutes);
  if (
    data?.length !== 1 ||
    data[0].left_minutes == null ||
    !data[0].session_id ||
    !Number.isSafeInteger(left) ||
    left < 0
  ) {
    throw new Error("База не подтвердила результат списания. Проверьте историю перед повтором.");
  }
  return { left, sessionId: data[0].session_id as string, error: null };
}
