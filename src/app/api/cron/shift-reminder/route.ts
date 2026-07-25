import { NextRequest, NextResponse } from "next/server";
import { sendShiftReminder } from "@/lib/telegram";

// Крон напоминалок про смену (пак C). Vercel зовёт этот путь дважды в сутки:
// утром ?type=open, вечером ?type=close (см. vercel.json).
//
// Шлём БЕЗУСЛОВНО, каждый день. Раньше здесь стояла проверка «есть ли сегодня
// запланированная смена» — и она молчала всегда: смены не заводят с вечера, они
// появляются в базе либо тем же утром после 9:00, либо прямо в момент нажатия
// «Открыть» (тогда у строки уже стоит opened_at и под фильтр она не попадает).
// В итоге за всё время в группу не ушло ни одного напоминания. Напоминалка —
// это будильник, а не отчёт по базе: она нужна ровно до того, как смену открыли.
//
// /api не проходит через middleware, сессии тут нет — защищаемся секретом
// (Vercel сам шлёт Authorization: Bearer <CRON_SECRET>). Без секрета роут не
// работает вообще: иначе чужой человек мог бы спамить группу инструкторов.

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron shift-reminder] CRON_SECRET не задан — запрос отклонён");
    return false;
  }
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const type = request.nextUrl.searchParams.get("type") === "open" ? "open" : "close";
  await sendShiftReminder(type);
  return NextResponse.json({ type, sent: true });
}
