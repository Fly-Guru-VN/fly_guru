import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { CLIENT_BOT_URL } from "@/lib/site";

// Личная ссылка в кабинет клиента (0071).
//
// Для тех, у кого Telegram заведён не на тот номер, что они оставили при
// оплате: «Поделиться номером» их не находит. Сотрудник выбирает карточку, мы
// выдаём одноразовый код в ссылке на бота, человек жмёт — и бот привязывает
// его аккаунт к этой карточке без всякого телефона.

// Сутки: ссылку отдают клиенту, который стоит рядом или ждёт в переписке.
// Дольше держать незачем — пересланная не туда ссылка должна быстро умереть.
export const LINK_CODE_TTL_MS = 24 * 60 * 60 * 1000;

const START_PREFIX = "link_";

// 12 случайных байт → 16 символов base64url. Telegram пропускает в start
// только A-Z a-z 0-9 _ - и до 64 символов, base64url ровно в это укладывается.
export function newLinkCode(): string {
  return randomBytes(12).toString("base64url");
}

export function memberLinkUrl(code: string): string {
  return `${CLIENT_BOT_URL}?start=${START_PREFIX}${code}`;
}

// «/start link_AbC…» → «AbC…». Всё остальное (голый /start, чужие параметры)
// → null: это обычный вход по номеру.
export function parseLinkStart(text: string): string | null {
  const m = /^\/start(?:@\w+)?\s+link_([A-Za-z0-9_-]{8,64})$/.exec(text.trim());
  return m ? m[1] : null;
}

export interface LinkClientOption {
  id: string;
  name: string;
  phone: string | null;
}

// Поиск карточки для ссылки: по имени или по куску номера. Номера в базе
// лежат «как ввели» (+84, пробелы, дефисы), поэтому сравниваем одни цифры.
// Три цифры и больше — ищем по телефону, иначе по имени.
export function matchClientsForLink(
  rows: LinkClientOption[],
  query: string,
  limit = 8,
): LinkClientOption[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const digits = q.replace(/\D/g, "");
  const byPhone = digits.length >= 3 && digits.length >= q.replace(/[\s+()-]/g, "").length;
  return rows
    .filter((c) =>
      byPhone
        ? (c.phone ?? "").replace(/\D/g, "").includes(digits)
        : c.name.toLowerCase().includes(q),
    )
    .slice(0, limit);
}

export async function createMemberLinkCode(input: {
  clientId: string;
  staffId: string;
}): Promise<string> {
  const supabase = createAdminClient();
  const code = newLinkCode();
  const { error } = await supabase.from("member_link_codes").insert({
    code,
    client_id: input.clientId,
    created_by: input.staffId,
    expires_at: new Date(Date.now() + LINK_CODE_TTL_MS).toISOString(),
  });
  if (error) {
    console.error("[member-link] code insert error:", error.message);
    throw new Error("не удалось создать ссылку");
  }
  return code;
}

export type RedeemResult =
  | { ok: true; clientName: string }
  | { ok: false; reason: "invalid" };

// Погасить код и привязать аккаунт. Гашение — одним UPDATE с условием «ещё не
// использован и не истёк»: два одновременных нажатия не пройдут оба.
export async function redeemMemberLinkCode(input: {
  code: string;
  telegramId: number;
  username?: string | null;
  firstName?: string | null;
}): Promise<RedeemResult> {
  const supabase = createAdminClient();
  const { data: used, error: useError } = await supabase
    .from("member_link_codes")
    .update({ used_at: new Date().toISOString(), used_by: input.telegramId })
    .eq("code", input.code)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("client_id, clients(name)")
    .maybeSingle();
  if (useError) {
    console.error("[member-link] code redeem error:", useError.message);
    throw new Error("не удалось проверить ссылку");
  }
  if (!used) return { ok: false, reason: "invalid" };

  const { error: linkError } = await supabase.from("client_telegram").upsert(
    {
      telegram_id: input.telegramId,
      client_id: used.client_id,
      phone: null,
      link_source: "code",
      username: input.username ?? null,
      first_name: input.firstName ?? null,
      linked_at: new Date().toISOString(),
    },
    { onConflict: "telegram_id" },
  );
  if (linkError) {
    console.error("[member-link] telegram link upsert error:", linkError.message);
    throw new Error("не удалось сохранить связь Telegram с клиентом");
  }

  const client = used.clients as unknown as { name: string | null } | null;
  return { ok: true, clientName: client?.name ?? "Гость" };
}
