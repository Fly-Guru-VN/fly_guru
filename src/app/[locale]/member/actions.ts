"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { verifyInitData } from "@/lib/tgAuth";
import { clientBotToken } from "@/lib/tgClientBot";
import {
  ACTIVE_BOOKING_STATUSES,
  loadMemberData,
  resolveMember,
  type MemberState,
} from "@/lib/memberCabinet";
import { canBookOn, canCancelBooking } from "@/lib/bookingWindow";
import { isRealDay } from "@/lib/bookings";
import { minutesLeft } from "@/lib/subscriptions";
import { parseRiders } from "@/lib/riders";
import { checkRateLimit } from "@/lib/rateLimit";
import { sendBookingNotification, sendStaffMessage } from "@/lib/telegram";
import { SITE_URL } from "@/lib/site";

// Серверная часть кабинета клиента.
//
// Каждое действие начинается одинаково: получить initData из браузера и
// проверить подпись Telegram (lib/tgAuth). Ничему, что пришло с клиента, кроме
// этой строки, мы не верим — ни id клиента, ни номеру заявки «на отмену».
// Клиента находим САМИ по telegram_id из проверенной подписи, и работаем
// только со строками этого клиента.

type Fail = { ok: false; error: string };
type Done = { ok: true };

const BAD_AUTH = "Не удалось вас узнать. Закройте кабинет и откройте заново из бота.";

// Кто пришёл. null — подпись не сошлась или бот не настроен.
async function whoIsIt(initData: string): Promise<number | null> {
  const token = clientBotToken();
  if (!token) return null;
  return verifyInitData(initData, token)?.id ?? null;
}

export async function loadCabinetAction(
  initData: string,
): Promise<MemberState | { state: "bad_auth" }> {
  const tgId = await whoIsIt(initData);
  if (!tgId) return { state: "bad_auth" };
  return loadMemberData(tgId);
}

export interface BookInput {
  date: string; // 'YYYY-MM-DD'
  time: string; // 'HH:MM'
  duration: number; // минут на одного
  riders: number; // сколько катаются одновременно
  comment?: string;
}

// Записаться. Заявка, а не подтверждённая бронь: её принимает живой человек —
// у системы нет расписания выходов по часам, и обещать время она не вправе.
export async function bookAction(
  initData: string,
  input: BookInput,
): Promise<Done | Fail> {
  const tgId = await whoIsIt(initData);
  if (!tgId) return { ok: false, error: BAD_AUTH };

  // Одна и та же кнопка, нажатая двадцать раз подряд, не должна превратиться в
  // двадцать заявок в чате у админа.
  if (!checkRateLimit(`member-book:${tgId}`)) {
    return { ok: false, error: "Слишком часто. Подождите минуту." };
  }

  const supabase = createAdminClient();
  const who = await resolveMember(supabase, tgId);
  if ("state" in who) return { ok: false, error: BAD_AUTH };

  // ── правила начальника ───────────────────────────────────────────────────
  if (!isRealDay(input.date)) return { ok: false, error: "Выберите дату." };
  if (!canBookOn(input.date)) {
    return {
      ok: false,
      error:
        "Записаться можно не позднее 20:00 предыдущего дня. Выберите день попозже или напишите в поддержку.",
    };
  }
  if (!/^\d{2}:\d{2}$/.test(input.time)) {
    return { ok: false, error: "Укажите время начала." };
  }
  const duration = Math.trunc(Number(input.duration));
  if (!Number.isFinite(duration) || duration < 15 || duration > 240) {
    return { ok: false, error: "Длительность — от 15 до 240 минут." };
  }
  const riders = parseRiders(input.riders);
  const totalMinutes = duration * riders;

  // Хватит ли минут. Проверяем, только если абонемент есть: без абонемента это
  // обычная платная запись, и минуты тут ни при чём.
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("id, total_minutes")
    .eq("client_id", who.clientId)
    .eq("status", "active")
    .order("sold_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sub) {
    const left = await minutesLeft(supabase, sub);
    if (totalMinutes > left) {
      return {
        ok: false,
        error: `На абонементе ${left} мин — на эту запись нужно ${totalMinutes}. Возьмите короче или продлите абонемент.`,
      };
    }
  }

  // Телефон обязателен в заявке — берём из карточки клиента, а не с клиента.
  const { data: client } = await supabase
    .from("clients")
    .select("name, phone")
    .eq("id", who.clientId)
    .maybeSingle();

  const noteParts = [
    "Запись из кабинета",
    `${duration} мин${riders > 1 ? ` × ${riders} райдера = ${totalMinutes} мин` : ""}`,
    sub ? "по абонементу" : "без абонемента",
  ];
  const comment = String(input.comment ?? "").trim().slice(0, 500);
  if (comment) noteParts.push(`Клиент: ${comment}`);

  const { error } = await supabase.from("bookings").insert({
    client_name: client?.name ?? who.clientName,
    phone: client?.phone ?? "",
    client_id: who.clientId,
    preferred_date: input.date,
    scheduled_time: input.time,
    internal_note: noteParts.join(" · "),
    src: "cabinet",
  });
  if (error) {
    console.error("[member] booking insert error:", error.message);
    return { ok: false, error: "Не получилось записать. Попробуйте ещё раз." };
  }

  await sendBookingNotification({
    serviceName: sub ? "Катание по абонементу" : "Катание (без абонемента)",
    clientName: client?.name ?? who.clientName,
    contact: client?.phone ?? "",
    messenger: "Telegram-кабинет",
    preferredDate: input.date,
    comment: `${input.time}, ${duration} мин${riders > 1 ? ` × ${riders}` : ""}${comment ? ` · ${comment}` : ""}`,
    src: "cabinet",
  });

  return { ok: true };
}

// Отменить свою запись. Заявку ищем сразу с client_id: чужой id, подставленный
// в запрос, просто ничего не найдёт.
export async function cancelAction(
  initData: string,
  bookingId: string,
): Promise<Done | Fail> {
  const tgId = await whoIsIt(initData);
  if (!tgId) return { ok: false, error: BAD_AUTH };

  const supabase = createAdminClient();
  const who = await resolveMember(supabase, tgId);
  if ("state" in who) return { ok: false, error: BAD_AUTH };

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, booking_no, preferred_date, scheduled_time, status, client_name")
    .eq("id", bookingId)
    .eq("client_id", who.clientId)
    .maybeSingle();

  if (!booking) return { ok: false, error: "Запись не найдена." };
  if (!(ACTIVE_BOOKING_STATUSES as readonly string[]).includes(booking.status)) {
    return { ok: false, error: "Эту запись уже нельзя отменить." };
  }
  if (!canCancelBooking(booking.preferred_date, booking.scheduled_time)) {
    return {
      ok: false,
      error:
        "До начала меньше часа — отменить уже нельзя. Напишите в поддержку, если случилось что-то серьёзное.",
    };
  }

  const { error } = await supabase
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("id", booking.id)
    .eq("client_id", who.clientId);
  if (error) {
    console.error("[member] cancel error:", error.message);
    return { ok: false, error: "Не получилось отменить. Попробуйте ещё раз." };
  }

  // Отмену обязательно видно в рабочем чате: инструктор мог уже планировать
  // этот выход, а в кабинет он не смотрит.
  await sendStaffMessage(
    [
      "❌ Клиент отменил запись",
      "",
      `👤 ${booking.client_name}`,
      `📅 ${booking.preferred_date ?? "—"} ${booking.scheduled_time ?? ""}`.trim(),
      booking.booking_no ? `№ ${booking.booking_no}` : "",
      "",
      `Открыть: ${SITE_URL}/admin/bookings`,
    ]
      .filter(Boolean)
      .join("\n"),
  );

  return { ok: true };
}
