import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Ночной автоархив заявок (пачка правок №5, п.12).
//
// Простыми словами: выполненные и отменённые заявки лежат в ленте до тех пор,
// пока админ не нажмёт «В архив» на каждой. Руками это никто не делает, и лента
// зарастает. Раз в сутки в 00:00 по Нячангу всё, что уже закрыто, уезжает в
// архив само — лента остаётся только с живыми заявками, а архив открывается
// своей вкладкой, ничего не теряется.
//
// Почему именно полночь: в этот момент вчерашний день закончился, и ни одна
// заявка «за сегодня» под чистку не попадает — админ досматривает день целиком.
//
// /api не проходит через proxy.ts — защищаемся секретом (Vercel шлёт Authorization: Bearer
// <CRON_SECRET>) и ходим service_role клиентом. Без секрета роут не работает
// вообще: иначе любой желающий отправил бы все заявки в архив одной ссылкой.

const CLOSED = ["done", "cancelled"];

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron archive-bookings] CRON_SECRET не задан — запрос отклонён");
    return false;
  }
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("bookings")
    .update({ status: "archived" })
    .in("status", CLOSED)
    .select("id");

  if (error) {
    console.error("[cron archive-bookings] update error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ archived: data?.length ?? 0 });
}
