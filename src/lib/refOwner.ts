import type { createClient } from "@/lib/supabase/server";
import type { createAdminClient } from "@/lib/supabase/admin";
import { failIfReadError } from "@/lib/dbError";
import { FRIEND_BONUS_MINUTES } from "@/lib/referralTerms";

// «Кто привёл гостя» — расшифровка реф-кода заявки в живого человека.
//
// Простыми словами: в заявке лежит только короткий код из ссылки (`abc123`).
// Сам по себе он админу ничего не говорит. Кодов у нас два вида, и ведут они
// себя по-разному:
//   • агентский (таблица agents) — даёт гостю скидку на базовое обучение и
//     награду агенту за приведённого клиента (суммы — в lib/agentTerms);
//   • личный код инструктора (users.ref_code, миграция 0011) — скидки НЕ даёт,
//     это просто «человек записался напрямую к этому инструктору»;
//   • код клиента — члена клуба (clients.ref_code, 0063): скидки нет, новому
//     гостю +10 минут к обучению или абонементу, пригласившему бонусные минуты
//     (lib/referralTerms).
// Поэтому в заявке показываем имя владельца ссылки и говорим про скидку только
// там, где она реально есть (пачка правок №5, п.4/5).

type Supabase =
  | Awaited<ReturnType<typeof createClient>>
  | ReturnType<typeof createAdminClient>;

export interface RefOwner {
  kind: "agent" | "instructor" | "client";
  name: string;
  // Агент: выключенному скидка и награда уже не начисляются (сервер при записи
  // ищет агента с active=true), значит и обещать их нельзя. Клиент: active =
  // член клуба — только ему ссылка приносит бонусы.
  active: boolean;
  /** Только у клиента: его карточка (clients.id) — ей идут бонусные минуты. */
  clientId?: string;
}

// Разбор пачкой: на странице заявок кодов десятки, поэтому два запроса на всю
// ленту, а не по запросу на карточку.
export async function resolveRefOwners(
  supabase: Supabase,
  codes: (string | null | undefined)[],
): Promise<Map<string, RefOwner>> {
  const unique = [...new Set(codes.filter(Boolean) as string[])];
  const byCode = new Map<string, RefOwner>();
  if (unique.length === 0) return byCode;

  const [agentsRes, usersRes, clientsRes] = await Promise.all([
    // Имя агента живёт в users: в самой таблице agents его нет, только связь
    // user_id + реф-код и комиссия.
    supabase
      .from("agents")
      .select("ref_code, active, user:users!user_id(name)")
      .in("ref_code", unique),
    supabase
      .from("users")
      .select("ref_code, name")
      .eq("role", "instructor")
      .in("ref_code", unique),
    // Членство — отдельной строкой в memberships (клиент без неё = не в клубе).
    supabase
      .from("clients")
      .select("id, ref_code, name, membership:memberships(id)")
      .in("ref_code", unique),
  ]);
  // Пустая карта означает «код точно неизвестен» и влияет на скидку, награду
  // агента и удаление кода из браузера. Ошибка БД — не тот же результат.
  failIfReadError(agentsRes.error, "не удалось прочитать реф-коды агентов");
  failIfReadError(usersRes.error, "не удалось прочитать реф-коды инструкторов");
  failIfReadError(clientsRes.error, "не удалось прочитать реф-коды клиентов");

  // Кладём от младшего к старшему — клиенты, инструкторы, агенты: коды
  // уникальны в каждой таблице, но между таблицами теоретически могут совпасть,
  // и тогда агент главнее (от него зависят скидка и награда) — как в /r/[code].
  for (const c of clientsRes.data ?? []) {
    const code = c.ref_code as string | null;
    if (!code) continue;
    const membership = c.membership as unknown as { id: string }[] | { id: string } | null;
    const member = Array.isArray(membership) ? membership.length > 0 : Boolean(membership);
    byCode.set(code, {
      kind: "client",
      name: (c.name as string | null) ?? "клиент",
      active: member,
      clientId: c.id as string,
    });
  }
  for (const u of usersRes.data ?? []) {
    const code = u.ref_code as string | null;
    if (code) byCode.set(code, { kind: "instructor", name: u.name as string, active: true });
  }
  for (const a of agentsRes.data ?? []) {
    const code = a.ref_code as string | null;
    if (!code) continue;
    const name = (a.user as unknown as { name: string } | null)?.name ?? "агент";
    byCode.set(code, { kind: "agent", name, active: Boolean(a.active) });
  }

  return byCode;
}

// Одна строка «кто привёл» для карточки заявки и для Telegram-уведомления —
// чтобы формулировка была одна и та же в обоих местах.
// discount — положена ли гостю скидка на самом деле (см. firstBasicTrainingByPhone
// в lib/agentReward): скидка даётся только за ПЕРВОЕ базовое обучение, и у гостя,
// который уже катался, её не будет. undefined = проверить не смогли; тогда просто
// не говорим про скидку, вместо того чтобы обещать несуществующее.
export function refOwnerLabel(
  code: string,
  owner: RefOwner | undefined,
  discount?: boolean,
): string {
  // Нерезолвленный код бывает только у СТАРЫХ заявок: с тех пор /api/bookings
  // проверяет владельца до вставки и мусорный код в базу не пишет вовсе.
  // Отключённый агент здесь не появится — он резолвится с active=false ниже.
  // Поэтому текст объясняющий, а не тревожный: чинить тут нечего.
  if (!owner) return `Реф-ссылка: код ${code} неизвестен — владельца больше нет`;
  if (owner.kind === "instructor") return `Личная ссылка инструктора: ${owner.name} · скидки нет`;
  // Новый ли гость — видно только при оформлении, поэтому здесь говорим об
  // условии, а не обещаем: уже катавшийся у нас бонуса не получит.
  if (owner.kind === "client") {
    return owner.active
      ? `Пригласил клиент: ${owner.name} · новому гостю +${FRIEND_BONUS_MINUTES} мин к обучению или абонементу`
      : `Пригласил клиент: ${owner.name} (не в клубе — бонусов нет)`;
  }
  if (!owner.active) return `Агент: ${owner.name} (отключён — скидки нет)`;
  // Размер скидки зависит от услуги (100 000 ₫ за базовое, 200 000 ₫ за
  // парное), а какую услугу выберут — на этом этапе ещё неизвестно. Поэтому
  // говорим о факте, а не о сумме: точная цифра появится при оформлении.
  if (discount === true) return `Агент: ${owner.name} · скидка на первое обучение`;
  if (discount === false)
    return `Агент: ${owner.name} · скидки нет — клиент уже проходил обучение`;
  return `Агент: ${owner.name}`;
}
