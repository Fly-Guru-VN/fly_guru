import crypto from "node:crypto";

// Вход в кабинет клиента без пароля — проверка «этот человек правда из нашего
// бота».
//
// Простыми словами. Когда Telegram открывает нашу страницу внутри себя, он
// кладёт в неё строку initData — там id пользователя, имя, время открытия и
// подпись. Подпись Telegram считает по секретному токену нашего бота, который
// знают только Telegram и наш сервер. Мы пересчитываем подпись у себя: сошлась —
// значит данные пришли от Telegram и их не подменили по дороге; не сошлась —
// это подделка, и мы такого «гостя» не пускаем.
//
// Пароля в этой схеме нет вообще: доказательством личности служит сам факт,
// что страницу открыл настоящий Telegram настоящему пользователю.

export interface TgUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}

// Сколько живёт открытая страница. Telegram кладёт в initData время открытия;
// строку старше суток не принимаем, чтобы однажды перехваченная initData не
// работала вечно. Сутки, а не час: люди держат мини-приложение открытым.
const MAX_AGE_SEC = 24 * 60 * 60;

// Сравнение подписей за постоянное время: обычное === выходит раньше на первом
// же непохожем символе, и по времени ответа можно подбирать подпись посимвольно.
function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ba.length === 0 || ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// Проверить initData и достать пользователя. null — не пускать.
export function verifyInitData(initData: string, botToken: string): TgUser | null {
  if (!initData || !botToken) return null;

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return null;
  }

  const hash = params.get("hash");
  if (!hash) return null;

  // Строка для проверки: все поля КРОМЕ самой подписи, по алфавиту, через \n.
  const pairs: string[] = [];
  for (const [key, value] of params.entries()) {
    if (key === "hash") continue;
    pairs.push(`${key}=${value}`);
  }
  pairs.sort();
  const dataCheckString = pairs.join("\n");

  // Ключ — не сам токен бота, а HMAC от него со словом «WebAppData»: так
  // описано у Telegram, и так подпись нельзя пересчитать, зная только токен
  // какого-нибудь другого бота.
  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const computed = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");
  if (!safeEqualHex(computed, hash)) return null;

  // Свежесть. auth_date — секунды эпохи, как их проставил Telegram.
  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate)) return null;
  if (Math.abs(Date.now() / 1000 - authDate) > MAX_AGE_SEC) return null;

  const rawUser = params.get("user");
  if (!rawUser) return null;
  try {
    const user = JSON.parse(rawUser) as TgUser;
    return typeof user?.id === "number" ? user : null;
  } catch {
    return null;
  }
}
