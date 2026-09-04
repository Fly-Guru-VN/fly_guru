import { createHash } from "node:crypto";
import { phoneDigits } from "@/lib/phone";

// Не кладём email/телефон в глобальный Map лимитера. Форматы одного телефона
// сводим к цифрам, email — к нижнему регистру, затем оставляем только хэш.
export function loginRateKey(identifier: string): string {
  const normalized = identifier.includes("@")
    ? identifier.trim().toLowerCase()
    : phoneDigits(identifier);
  return createHash("sha256").update(normalized).digest("hex");
}

// В production ссылка восстановления всегда указывает на наш канонический
// домен. Заголовок Host приходит от клиента и не должен становиться частью
// security-ссылки. Для локальной разработки оставляем только loopback-адреса.
export function passwordResetOrigin(
  headers: Pick<Headers, "get">,
  siteUrl: string,
  production = process.env.NODE_ENV === "production",
): string {
  const fallback = siteUrl.replace(/\/+$/, "");
  if (production) return fallback;

  const host = headers.get("host")?.trim();
  if (!host) return fallback;

  try {
    const candidate = new URL(`http://${host}`);
    const isLoopback =
      candidate.hostname === "localhost" ||
      candidate.hostname === "127.0.0.1" ||
      candidate.hostname === "[::1]";
    const isBareOrigin =
      !candidate.username &&
      !candidate.password &&
      candidate.pathname === "/" &&
      !candidate.search &&
      !candidate.hash;

    return isLoopback && isBareOrigin ? candidate.origin : fallback;
  } catch {
    return fallback;
  }
}
