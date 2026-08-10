import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";

// Запись факта перехода по нашей ссылке — в таблицу ref_visits.
//
// Переходы бывают двух видов, и оба приходят сюда (0037):
//  • по реф-ссылке агента или инструктора /r/<code> — приезжает code;
//  • по меченой рекламной ссылке (?src=instagram, utm_*) — приезжают src, utm
//    и страница, на которую вёл переход.
//
// Зачем второй вид: метки до сих пор доезжали только вместе с заявкой, то есть
// про тех, кто дошёл до формы. Сколько человек кликнуло по ссылке в шапке
// Instagram и ушло — своя база не знала. Vercel Analytics это показывает, но
// его режут блокировщики рекламы, и про деньги он ничего не знает.
//
// Это только статистика посещений — на заявки и на всё остальное никак не
// влияет.
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
// Метка канала — то, что админ завёл в «Материалах» (SRC_RE там же). Здесь
// правило чуть шире: метку в ссылке может напечатать руками кто угодно, и
// потерять переход из-за заглавной буквы обиднее, чем принять её.
const SRC_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const MAX_PER_MINUTE = 20; // гость на лендинге стучится один раз

// Метки адреса: столько же ограничений, сколько на заявке (api/bookings).
const UTM_MAX_KEYS = 10;
const UTM_MAX_LEN = 200;
const PATH_MAX = 200;

interface Payload {
  code?: string;
  src?: string;
  utm?: Record<string, unknown>;
  path?: string;
}

function cleanUtm(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (Object.keys(out).length >= UTM_MAX_KEYS) break;
    if (typeof value !== "string") continue;
    out[key.slice(0, 40)] = value.slice(0, UTM_MAX_LEN);
  }
  return out;
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

  const rawCode = body.code?.trim();
  const rawSrc = body.src?.trim();
  // Мусор не пишем вовсе: строка визита с кодом на мегабайт — это не
  // статистика, это способ засорить базу.
  const code = rawCode && CODE_RE.test(rawCode) ? rawCode : null;
  const src = rawSrc && SRC_RE.test(rawSrc) ? rawSrc : null;
  const utm = cleanUtm(body.utm);

  // Переход без единой метки считать нечем — такой заход просто не наш случай
  // (по сайту ходят и без рекламы, для этого есть Vercel Analytics).
  if (!code && !src && Object.keys(utm).length === 0) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Путь пишем только свой: чужая ссылка в этом поле — приглашение показать
  // её потом на админском экране.
  const rawPath = body.path?.trim();
  const path =
    rawPath && rawPath.startsWith("/") ? rawPath.slice(0, PATH_MAX) : null;

  const userAgent = req.headers.get("user-agent")?.slice(0, 500) ?? null;

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("ref_visits")
    .insert({ code, src, utm, path, user_agent: userAgent });

  if (error) {
    // Колонки src/utm/path приехали в 0037. Если деплой обогнал миграцию,
    // переход по реф-ссылке всё равно надо записать — счётчик агентов на нём
    // держится. Рекламный переход в таком случае теряем: писать его некуда.
    if (code) {
      const { error: legacyError } = await supabase
        .from("ref_visits")
        .insert({ code, user_agent: userAgent });
      if (!legacyError) return NextResponse.json({ ok: true });
    }
    console.error("[ref-visits] insert error:", error.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
