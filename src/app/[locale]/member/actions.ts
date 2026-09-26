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
import { canBookOn, canCancelBooking, isBookingOpenNow } from "@/lib/bookingWindow";
import { isRealDay } from "@/lib/bookings";
import { isUuid } from "@/lib/photos";
import { minutesLeft } from "@/lib/subscriptions";
import { bonusMinutesLeft } from "@/lib/referrals";
import { BONUS_SERVICE_CODE } from "@/lib/referralTerms";
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
  duration: number; // минут на одного — только для записи по абонементу
  riders: number; // сколько катаются одновременно — тоже только для абонемента
  comment?: string;
  // Выбранная услуга. null — «катание по абонементу»: услуги как таковой нет,
  // есть минуты и число катающихся.
  serviceId?: string | null;
  // Катание за бонусные минуты от приглашённых друзей (0063) — те же минуты и
  // катающиеся, но списываются с бонусного баланса. Только без serviceId.
  bonus?: boolean;
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
  // Ночью заявку не принимаем совсем: бронь подтверждает живой админ.
  if (!isBookingOpenNow()) {
    return {
      ok: false,
      error:
        "Запись работает с 8:00 до 20:00. Сейчас закрыто — напишите в поддержку, вас оформят вручную.",
    };
  }
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
  // Выбранное занятие. Кабинет умеет два вида записи: катание по абонементу
  // (минуты × катающиеся) и обычная услуга из общего списка. Услугу проверяем
  // САМИ: с клиента приходит только id, а он обязан существовать и быть
  // активным — иначе заявка уедет в чат с пустой услугой.
  const wantedService = String(input.serviceId ?? "").trim();
  let service: { id: string; name: string } | null = null;
  if (wantedService) {
    if (!isUuid(wantedService)) {
      return { ok: false, error: "Выберите занятие из списка." };
    }
    const { data, error: serviceError } = await supabase
      .from("services")
      .select("id, name")
      .eq("id", wantedService)
      .eq("active", true)
      .maybeSingle();
    if (serviceError) {
      console.error("[member] service lookup error:", serviceError.message);
      return { ok: false, error: "Не удалось проверить занятие. Попробуйте ещё раз." };
    }
    if (!data) {
      return {
        ok: false,
        error: "Такого занятия у нас уже нет. Обновите кабинет и выберите заново.",
      };
    }
    service = { id: data.id as string, name: data.name as string };
  }

  // Минуты и число катающихся — только для записи по абонементу. У обычной
  // услуги длительность своя, она указана в прайсе, и клиент её не назначает.
  let duration = 0;
  let riders = 1;
  let totalMinutes = 0;
  if (!service) {
    duration = Math.trunc(Number(input.duration));
    if (!Number.isFinite(duration) || duration < 15 || duration > 240) {
      return { ok: false, error: "Длительность — от 15 до 240 минут." };
    }
    riders = parseRiders(input.riders);
    totalMinutes = duration * riders;
  }

  // За бонусные минуты: хватит ли баланса и какая услуга ляжет в заявку.
  // Услуга «Бонусные минуты» нужна инструктору — открыв заявку, он сразу
  // попадёт в нужный режим записи. Окончательно остаток проверит списание.
  const useBonus = !service && input.bonus === true;
  let bonusServiceId: string | null = null;
  if (useBonus) {
    const left = await bonusMinutesLeft(supabase, who.clientId);
    if (totalMinutes > left) {
      return {
        ok: false,
        error: `Бонусных минут ${left} — на эту запись нужно ${totalMinutes}. Возьмите короче.`,
      };
    }
    const { data: bonusService, error: bonusError } = await supabase
      .from("services")
      .select("id")
      .eq("code", BONUS_SERVICE_CODE)
      .maybeSingle();
    if (bonusError || !bonusService) {
      console.error("[member] bonus service lookup error:", bonusError?.message ?? "missing");
      return { ok: false, error: "Не удалось записать за бонусные минуты. Напишите в поддержку." };
    }
    bonusServiceId = bonusService.id as string;
  }

  // Хватит ли минут. Вопрос только к записи по абонементу и только если сам
  // абонемент есть: без него это обычная платная запись, и минуты ни при чём.
  let sub: { id: string; total_minutes: number } | null = null;
  if (!service && !useBonus) {
    const { data, error: subError } = await supabase
      .from("subscriptions")
      .select("id, total_minutes")
      .eq("client_id", who.clientId)
      .eq("status", "active")
      .order("sold_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (subError) {
      console.error("[member] subscription lookup error:", subError.message);
      return { ok: false, error: "Не удалось проверить абонемент. Попробуйте ещё раз." };
    }
    sub = data ? { id: data.id as string, total_minutes: Number(data.total_minutes) } : null;

    if (sub) {
      const left = await minutesLeft(supabase, sub);
      if (totalMinutes > left) {
        return {
          ok: false,
          error: `На абонементе ${left} мин — на эту запись нужно ${totalMinutes}. Возьмите короче или продлите абонемент.`,
        };
      }
    }
  }

  // Телефон обязателен в заявке — берём из карточки клиента, а не с клиента.
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("name, phone")
    .eq("id", who.clientId)
    .maybeSingle();
  if (clientError || !client) {
    console.error(
      "[member] client lookup error:",
      clientError?.message ?? "client row missing",
    );
    return { ok: false, error: "Не удалось получить данные клиента. Попробуйте ещё раз." };
  }
  if (!client.phone) {
    return {
      ok: false,
      error: "В карточке нет телефона. Напишите в поддержку — добавим номер и запишем вас.",
    };
  }

  const noteParts = service
    ? ["Запись из кабинета", service.name]
    : [
        "Запись из кабинета",
        `${duration} мин${riders > 1 ? ` × ${riders} райдера = ${totalMinutes} мин` : ""}`,
        useBonus ? "за бонусные минуты" : sub ? "по абонементу" : "без абонемента",
      ];
  const comment = String(input.comment ?? "").trim().slice(0, 500);
  if (comment) noteParts.push(`Клиент: ${comment}`);

  const { error } = await supabase.from("bookings").insert({
    client_name: client.name ?? who.clientName,
    phone: client.phone,
    client_id: who.clientId,
    preferred_date: input.date,
    scheduled_time: input.time,
    // Услуга есть только у записи на занятие: катание по абонементу — это
    // минуты, отдельной строки в services под него нет.
    service_id: service?.id ?? bonusServiceId,
    internal_note: noteParts.join(" · "),
    // В public_note лежит только исходное пожелание самого клиента. Служебная
    // раскладка минут остаётся в internal_note и назад в Mini App не уходит.
    public_note: comment || null,
    src: "cabinet",
  });
  if (error) {
    console.error("[member] booking insert error:", error.message);
    return { ok: false, error: "Не получилось записать. Попробуйте ещё раз." };
  }

  const when = service
    ? input.time
    : `${input.time}, ${duration} мин${riders > 1 ? ` × ${riders}` : ""}`;
  await sendBookingNotification({
    serviceName:
      service?.name ??
      (useBonus
        ? "Катание за бонусные минуты"
        : sub
          ? "Катание по абонементу"
          : "Катание (без абонемента)"),
    clientName: client.name ?? who.clientName,
    contact: client.phone,
    messenger: "Telegram-кабинет",
    preferredDate: input.date,
    comment: `${when}${comment ? ` · ${comment}` : ""}`,
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

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id, booking_no, preferred_date, scheduled_time, status, client_name")
    .eq("id", bookingId)
    .eq("client_id", who.clientId)
    .maybeSingle();
  if (bookingError) {
    console.error("[member] booking lookup error:", bookingError.message);
    return { ok: false, error: "Не удалось проверить запись. Попробуйте ещё раз." };
  }

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

  const { data: cancelled, error } = await supabase
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("id", booking.id)
    .eq("client_id", who.clientId)
    // Между чтением выше и update админ мог уже завершить/отменить запись.
    // Не перетираем более свежее состояние устаревшим нажатием клиента.
    .in("status", ACTIVE_BOOKING_STATUSES as unknown as string[])
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[member] cancel error:", error.message);
    return { ok: false, error: "Не получилось отменить. Попробуйте ещё раз." };
  }
  if (!cancelled) {
    return { ok: false, error: "Статус записи уже изменился. Обновите кабинет." };
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
