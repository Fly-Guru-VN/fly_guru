import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";

// «Что за код лежит у гостя в браузере» — один короткий ответ для формы записи
// и для карточек прайса.
//
// Зачем адрес вообще нужен. Реф-код запоминается в браузере на 30 дней
// (lib/attribution), и человек может открыть форму записи с любой страницы
// сайта, а не только с лендинга /r/<код>. Но обещать скидку можно только по
// ссылке ЖИВОГО агента: инструкторский код скидки не даёт, выключенный агент —
// тоже. Проверить это может только сервер, у браузера в руках лишь строка.
//
// Что отвечаем: kind — 'agent' | 'instructor' | null. Ничего чувствительного
// (ни имени, ни комиссии) здесь нет намеренно: адрес открыт всем без входа,
// коды короткие, и перебором из него не должно доставаться ничего, кроме
// «да, такая ссылка есть».
//
// Ограничитель — как на соседних открытых адресах (см. api/ref-visits): без
// него код перебирается пачками, а каждый заход это запрос в базу.

const CODE_RE = /^[a-zA-Z0-9_-]{1,32}$/;
const MAX_PER_MINUTE = 30; // гость спрашивает один раз на открытие формы

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  if (!checkRateLimit(`ref-lookup:${clientIp(req.headers)}`, MAX_PER_MINUTE)) {
    return NextResponse.json({ kind: null }, { status: 429 });
  }

  const { code } = await params;
  if (!code || !CODE_RE.test(code)) {
    return NextResponse.json({ kind: null });
  }

  const supabase = createAdminClient();

  // Сначала агент — от него зависят скидка и награда, и при совпадении кодов
  // между таблицами он главнее (то же правило, что в lib/refOwner и на
  // лендинге /r/[code]). Выключенного агента не отдаём вовсе: скидки по его
  // ссылке уже не будет, и обещать её нельзя.
  const { data: agent } = await supabase
    .from("agents")
    .select("id")
    .eq("ref_code", code)
    .eq("active", true)
    .maybeSingle();
  if (agent) return NextResponse.json({ kind: "agent" });

  const { data: instructor } = await supabase
    .from("users")
    .select("id")
    .eq("ref_code", code)
    .eq("role", "instructor")
    .maybeSingle();
  if (instructor) return NextResponse.json({ kind: "instructor" });

  return NextResponse.json({ kind: null });
}
