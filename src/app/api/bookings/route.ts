import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";
import { sendBookingNotification } from "@/lib/telegram";
import { isValidPhone, normalizeTelegram, phoneDigits } from "@/lib/phone";
import { resolveRefOwners, refOwnerLabel, type RefOwner } from "@/lib/refOwner";
import { firstBasicTrainingByPhone } from "@/lib/agentReward";

// «Серверная дверь» для заявок с форм. Форма шлёт сюда данные, а здесь мы их
// проверяем, защищаем от спама и сохраняем в таблицу bookings.

// Форма присылает вот такой набор полей.
interface BookingPayload {
  clientName?: string;
  contact?: string; // телефон, как ввёл гость
  telegram?: string; // ник в телеге — необязателен (0018)
  messenger?: string; // WhatsApp / Telegram / Zalo
  serviceId?: string; // uuid услуги из таблицы services
  preferredDate?: string; // желаемая дата 'YYYY-MM-DD'
  comment?: string;
  honeypot?: string; // поле-ловушка: у живого человека всегда пустое
  // Метки источника, собранные на клиенте (см. lib/attribution.ts):
  ref_code?: string | null;
  src?: string | null;
  utm?: Record<string, string>;
}

// Простая проверка, что строка похожа на uuid (id услуги). Если нет — не рискуем
// нарушить связь с таблицей услуг и просто не проставляем услугу.
function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

// Обрезка текстовых полей (ревизия безопасности 2026-08-07). Форму заполняет
// не только человек: телефон и услугу мы проверяли и раньше, а имя, комментарий
// и метки источника писались в базу как есть — то есть скриптом туда заливался
// хоть мегабайт текста на каждую заявку. Живому гостю этих длин хватает с
// запасом, поэтому режем молча, а не отказываем: настоящий человек с длинным
// вопросом не должен получить «ошибку» вместо записи.
function trim(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  return s ? s.slice(0, max) : null;
}

// Настоящий ли это день календаря. Одной проверки формата мало: «2026-13-99»
// выглядит как дата, но такого дня нет — Postgres отвечает ошибкой, и гость
// видит «заявка не сохранилась» вместо записи. Дату из формы выбирают
// календарём, так что сюда несуществующий день приезжает только от того, кто
// шлёт запрос мимо формы; ему просто не проставим дату.
function isRealDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const d = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === day;
}

// Метки рекламы (utm_source и прочие) приходят из адреса и целиком уезжают в
// одну колонку json. Ограничиваем и число меток, и длину каждой.
const UTM_MAX_KEYS = 10;
const UTM_MAX_LEN = 200;
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
  let body: BookingPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  // 1. Honeypot. Если ловушка заполнена — это бот. Отвечаем «успех», но НЕ пишем
  //    в базу: пусть бот думает, что всё получилось, и не пробует снова.
  if (body.honeypot && body.honeypot.trim() !== "") {
    return NextResponse.json({ ok: true });
  }

  // 2. Ограничение частоты по IP-адресу.
  if (!checkRateLimit(`bookings:${clientIp(req.headers)}`)) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429 },
    );
  }

  // 3. Минимальная проверка: без имени и контакта заявка бессмысленна.
  const clientName = trim(body.clientName, 100);
  const contact = trim(body.contact, 40);
  if (!clientName || !contact) {
    return NextResponse.json(
      { ok: false, error: "missing_fields" },
      { status: 400 },
    );
  }

  // Телефон проверяем и здесь, а не только в форме: проверку на клиенте
  // обходит кто угодно, а заявка без рабочего номера — это клиент, до
  // которого школа не дозвонится, и узнают об этом через сутки.
  if (!isValidPhone(contact)) {
    return NextResponse.json(
      { ok: false, error: "bad_phone" },
      { status: 400 },
    );
  }

  const serviceId = body.serviceId && isUuid(body.serviceId) ? body.serviceId : null;
  const messenger = trim(body.messenger, 40);
  const comment = trim(body.comment, 1000);
  // Дата — только существующий день; всё прочее в колонку date не ляжет.
  const preferredDateRaw = trim(body.preferredDate, 10);
  const preferredDate =
    preferredDateRaw && isRealDay(preferredDateRaw) ? preferredDateRaw : null;
  const refCode = trim(body.ref_code, 32);
  const src = trim(body.src, 64);
  const utm = cleanUtm(body.utm);

  // Канал связи и комментарий клиента кладём в internal_note (стартовая
  // заметка для админа; дальше он ведёт в ней договорённости с клиентом).
  // Отдельных колонок в схеме нет, а терять пожелания клиента нельзя.
  const noteParts: string[] = [];
  if (messenger) noteParts.push(`Связь: ${messenger}`);
  if (comment) noteParts.push(`Клиент: ${comment}`);
  const internalNote = noteParts.join(" · ") || null;

  const supabase = createAdminClient();

  // 4. Реф-код проверяем ДО записи заявки. Раньше он писался в базу как есть:
  //    ссылка с опечаткой или код давно удалённого агента оседали в заявке
  //    навсегда, админ видел «владелец не найден», а сам код жил ещё 30 дней в
  //    браузере гостя и лез в каждую следующую заявку с того же устройства.
  //    Не нашли владельца — код не сохраняем; src и utm при этом остаются,
  //    откуда пришёл гость, мы всё равно знаем.
  let refOwner: RefOwner | undefined;
  if (refCode) {
    refOwner = (await resolveRefOwners(supabase, [refCode])).get(refCode);
  }
  const storedRefCode = refOwner ? refCode : null;

  // 5. Запись заявки. status по умолчанию 'new' (задан в схеме).
  // Сразу забираем присвоенный номер — покажем его клиенту на /thanks.
  const { data: created, error } = await supabase
    .from("bookings")
    .insert({
      client_name: clientName,
      // Храним цифрами: так заявка сматчится с карточкой клиента по телефону
      // (phonesMatch сравнивает хвост), как бы гость ни расставил пробелы.
      phone: phoneDigits(contact) || contact,
      telegram_username: normalizeTelegram(body.telegram),
      service_id: serviceId,
      preferred_date: preferredDate,
      ref_code: storedRefCode,
      src,
      utm,
      internal_note: internalNote,
    })
    .select("booking_no")
    .single();

  if (error) {
    console.error("[bookings] insert error:", error.message);
    return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
  }

  // 6. Уведомление в Telegram. Для красивого текста подтянем название услуги.
  let serviceName: string | null = null;
  if (serviceId) {
    const { data } = await supabase
      .from("services")
      .select("name")
      .eq("id", serviceId)
      .maybeSingle();
    serviceName = data?.name ?? null;
  }

  // Реф-код расшифровываем в имя: в чате нужно сразу видеть, агент это (тогда
  // будет скидка и награда) или личная ссылка инструктора. Владельца уже нашли
  // выше — непринятый код в чате не упоминаем вовсе, это шум для админа.
  let refLine: string | null = null;
  if (storedRefCode && refOwner) {
    // Скидку обещаем в чате, только если она действительно будет: повторному
    // гостю по той же ссылке её уже не дадут (скидка — за первое обучение).
    const discount =
      refOwner.kind === "agent" && refOwner.active
        ? (await firstBasicTrainingByPhone(supabase, [contact])).get(contact)
        : undefined;
    refLine = refOwnerLabel(storedRefCode, refOwner, discount);
  }

  await sendBookingNotification({
    serviceName,
    clientName,
    contact,
    messenger,
    preferredDate,
    refLine,
    src,
    comment,
  });

  // refAccepted говорит форме, что делать с кодом в браузере гостя: false —
  // код мусорный, форма его забудет, чтобы он не тащился в следующие заявки.
  return NextResponse.json({
    ok: true,
    bookingNo: created?.booking_no ?? null,
    refAccepted: refCode ? Boolean(refOwner) : true,
  });
}
