import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Ночное закрытие просроченных абонементов (ревизия 2026-07-25).
//
// Простыми словами: минуты абонемента живут 3 месяца. Но статус «истёк» до сих
// пор никто не ставил заранее — он проставлялся только в тот момент, когда
// инструктор пытался списать минуты и получал отказ. До этого абонемент висел
// «активным»: в списке админа, в подсказке «у клиента есть абонемент», в
// остатке минут на экране списания. Инструктор видел живой абонемент там, где
// его уже нет, и узнавал правду при клиенте.
//
// Раз в сутки переводим всё, у чего срок вышел, в expired. Деньги это не
// трогает: выручка считается по paid_at (месяц оплаты), а не по статусу.
// Отменённые (cancelled) не воскрешаем и не трогаем — это другое состояние.
//
// /api без middleware — защищаемся секретом (Vercel шлёт Authorization: Bearer
// <CRON_SECRET>) и ходим service_role клиентом, как остальные кроны.

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron expire-subscriptions] CRON_SECRET не задан — запрос отклонён");
    return false;
  }
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  // Берём и active, и used_up: минуты могли кончиться раньше срока, но сам
  // абонемент всё равно истёк — в отчётах это разные вещи.
  const { data, error } = await supabase
    .from("subscriptions")
    .update({ status: "expired" })
    .in("status", ["active", "used_up"])
    .not("expires_at", "is", null)
    .lt("expires_at", new Date().toISOString())
    .select("id");

  if (error) {
    console.error("[cron expire-subscriptions] update error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ expired: data?.length ?? 0 });
}
