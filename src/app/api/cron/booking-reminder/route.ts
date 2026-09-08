import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACTIVE_BOOKING_STATUSES } from "@/lib/memberCabinet";
import {
  CANCEL_WINDOW_MIN,
  isSoonReminderDue,
  parseTimeText,
} from "@/lib/bookingWindow";
import { dayShort, vnShiftDays, vnToday } from "@/lib/dates";
import { callClientBot, OPEN_CABINET_BUTTON } from "@/lib/tgClientBot";

// Напоминалка клиенту о его записи (prompt 12, этап 5). Vercel зовёт этот путь
// дважды в разном режиме (см. vercel.json):
//
//   ?type=eve   — вечером накануне, в 20:00 по Нячангу. Тот же момент, когда
//                 закрывается запись на завтра: день у школы уже собран.
//   ?type=soon  — за два часа до начала. Крон бегает каждые полчаса и берёт
//                 тех, у кого до старта осталось меньше двух часов. Два часа —
//                 чтобы человек успел отменить САМ: отмена закрывается за час.
//
// Пишем клиентским ботом (TELEGRAM_CLIENT_BOT_TOKEN) — тем самым, в котором
// живёт кабинет. Служебные боты сюда не годятся: это чат с клиентом.
//
// Кому не пишем: у кого нет связи client_telegram (он не нажимал «Поделиться
// номером» — писать некуда) и чью заявку уже закрыли или отменили.
//
// /api не проходит через proxy.ts — защищаемся секретом (Vercel шлёт
// Authorization: Bearer <CRON_SECRET>) и ходим service_role клиентом. Без
// секрета роут не работает вообще: иначе чужой человек рассылал бы клиентам
// школы что угодно от её имени.

interface Row {
  id: string;
  client_id: string | null;
  preferred_date: string | null;
  scheduled_time: string | null;
  services: { name: string } | null;
}

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron booking-reminder] CRON_SECRET не задан — запрос отклонён");
    return false;
  }
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

const cancelWindow =
  CANCEL_WINDOW_MIN >= 60 ? `${CANCEL_WINDOW_MIN / 60} ч` : `${CANCEL_WINDOW_MIN} мин`;

function reminderText(type: "eve" | "soon", row: Row, time: string | null): string {
  const service = row.services?.name ?? "занятие";
  const day = row.preferred_date ? dayShort(row.preferred_date) : "";

  if (type === "eve") {
    return [
      "🪁 Напоминаем: завтра вы записаны",
      "",
      `📅 ${day}${time ? `, ${time}` : ""}`,
      `🏄 ${service}`,
      "",
      `Планы изменились — отмените запись в кабинете. Отмена работает не позднее чем за ${cancelWindow} до начала.`,
    ].join("\n");
  }

  return [
    `🪁 Сегодня${time ? ` в ${time}` : ""} — ваша запись`,
    "",
    `🏄 ${service}`,
    "",
    `Если не получается — отмените прямо сейчас: за ${cancelWindow} до начала отмена закрывается.`,
  ].join("\n");
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const type = request.nextUrl.searchParams.get("type") === "eve" ? "eve" : "soon";
  const day = type === "eve" ? vnShiftDays(vnToday(), 1) : vnToday();
  const column = type === "eve" ? "reminded_eve_at" : "reminded_soon_at";

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("bookings")
    .select("id, client_id, preferred_date, scheduled_time, services(name)")
    .eq("preferred_date", day)
    .in("status", ACTIVE_BOOKING_STATUSES as unknown as string[])
    .is(column, null)
    .not("client_id", "is", null);
  if (error) {
    console.error("[cron booking-reminder] bookings read error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as Row[];
  const now = Date.now();

  // Время занятия у нас — свободный текст (исторически его вписывал админ
  // руками). Не разобрали — за два часа напомнить не о чем, молчим: лучше не
  // прислать, чем прислать не вовремя. Вечернее напоминание уходит и без него.
  const due =
    type === "eve"
      ? rows
      : rows.filter((row) => isSoonReminderDue(row.preferred_date, row.scheduled_time, now));

  const clientIds = [...new Set(due.map((row) => row.client_id).filter(Boolean))];
  if (clientIds.length === 0) {
    return NextResponse.json({ type, day, due: 0, sent: 0 });
  }

  const { data: links, error: linkError } = await supabase
    .from("client_telegram")
    .select("client_id, telegram_id")
    .in("client_id", clientIds as string[]);
  if (linkError) {
    console.error("[cron booking-reminder] telegram links read error:", linkError.message);
    return NextResponse.json({ error: linkError.message }, { status: 500 });
  }

  // Один клиент — один чат. Карточку могли привязать с двух аккаунтов Telegram
  // (например, поменяли номер): дублировать напоминание в оба ни к чему.
  const chatOf = new Map<string, number>();
  for (const link of links ?? []) {
    const clientId = link.client_id as string | null;
    if (clientId && !chatOf.has(clientId)) chatOf.set(clientId, link.telegram_id as number);
  }

  // Отмечаем ТОЛЬКО те, что действительно ушли: не доставили (бот не настроен,
  // человек заблокировал бота) — отметку не ставим, следующий запуск попробует
  // снова. Иначе напоминание тихо потерялось бы навсегда.
  const sent: string[] = [];
  for (const row of due) {
    const chatId = row.client_id ? chatOf.get(row.client_id) : undefined;
    if (!chatId) continue;
    const ok = await callClientBot("sendMessage", {
      chat_id: chatId,
      text: reminderText(type, row, parseTimeText(row.scheduled_time)),
      reply_markup: OPEN_CABINET_BUTTON,
    });
    if (ok) sent.push(row.id);
  }

  if (sent.length > 0) {
    const { error: markError } = await supabase
      .from("bookings")
      .update({ [column]: new Date().toISOString() })
      .in("id", sent);
    if (markError) {
      // Сообщения уже ушли. Молчать нельзя: без отметки следующий запуск
      // пришлёт их повторно, и человек получит одно и то же дважды.
      console.error("[cron booking-reminder] mark error:", markError.message);
      return NextResponse.json({ error: markError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ type, day, due: due.length, sent: sent.length });
}
