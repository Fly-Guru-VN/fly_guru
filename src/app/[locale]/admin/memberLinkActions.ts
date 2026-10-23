"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveAppUser, type AppRole } from "@/lib/auth";
import { loadAllClients } from "@/lib/clients";
import {
  createMemberLinkCode,
  matchClientsForLink,
  memberLinkUrl,
  type LinkClientOption,
} from "@/lib/memberLink";

// Плашка «Кабинет клиента в Telegram» (0071) на вкладках заявок и записей.
// Выдавать личные ссылки может любой сотрудник, который работает с клиентами:
// клиент обычно стоит рядом с инструктором на пляже.
const LINK_ROLES: AppRole[] = ["admin", "dev", "smm", "instructor"];

async function linkStaff() {
  const user = await getActiveAppUser();
  return user && LINK_ROLES.includes(user.role) ? user : null;
}

export async function searchLinkClientsAction(
  query: string,
): Promise<{ clients: LinkClientOption[]; error: string | null }> {
  if (!(await linkStaff())) return { clients: [], error: "Нет доступа" };
  const { rows, error } = await loadAllClients<LinkClientOption>(
    createAdminClient(),
    "id, name, phone",
  );
  if (error) return { clients: [], error: "Не удалось найти клиента" };
  return { clients: matchClientsForLink(rows, String(query ?? "")), error: null };
}

export async function createMemberLinkAction(
  clientId: string,
): Promise<{ url: string | null; error: string | null }> {
  const user = await linkStaff();
  if (!user) return { url: null, error: "Нет доступа" };
  if (typeof clientId !== "string" || !clientId) {
    return { url: null, error: "Клиент не выбран" };
  }
  try {
    const code = await createMemberLinkCode({ clientId, staffId: user.id });
    return { url: memberLinkUrl(code), error: null };
  } catch {
    return { url: null, error: "Не удалось создать ссылку, попробуйте ещё раз" };
  }
}
