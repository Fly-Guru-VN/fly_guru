import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";

// Запись факта перехода по реф-ссылке /r/[code].
// Страница лендинга при открытии тихо стучится сюда, а мы сохраняем строку в
// таблицу ref_visits (какой код и с какого браузера). Это только статистика
// посещений — на заявки и на всё остальное никак не влияет.
//
// Адрес открыт всем без входа и пишет служебным ключом, поэтому здесь стоят
// два ограничителя (ревизия безопасности 2026-08-07). Без них любой мог за
// ночь залить сюда миллион строк, да ещё и по мегабайту в каждой: база
// раздувается, счёт от Supabase растёт, а сама таблица (статистика переходов)
// становится бессмысленной. Единственной защитой было то, что про этот адрес
// никто не знает — а это не защита.

// Реф-коды короткие и из букв с цифрами: агентские и инструкторские — 6
// символов (см. randomRefCode). С запасом принимаем до 32 — всё остальное
// заведомо не наш код.
const CODE_RE = /^[a-zA-Z0-9_-]{1,32}$/;
const MAX_PER_MINUTE = 20; // гость на лендинге стучится один раз

interface Payload {
  code?: string;
}

export async function POST(req: NextRequest) {
  if (!checkRateLimit(`ref-visits:${clientIp(req.headers)}`, MAX_PER_MINUTE)) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  let body: Payload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const code = body.code?.trim();
  // Мусор не пишем вовсе: строка визита с кодом на мегабайт — это не
  // статистика, это способ засорить базу.
  if (!code || !CODE_RE.test(code)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const userAgent = req.headers.get("user-agent")?.slice(0, 500) ?? null;

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("ref_visits")
    .insert({ code, user_agent: userAgent });

  if (error) {
    console.error("[ref-visits] insert error:", error.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
