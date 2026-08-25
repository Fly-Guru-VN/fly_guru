import { createAdminClient } from "@/lib/supabase/admin";
import { isValidPhone, normalizeTelegram, phoneDigits } from "@/lib/phone";
import { resolveRefOwners, refOwnerLabel, type RefOwner } from "@/lib/refOwner";
import { firstBasicTrainingByPhone } from "@/lib/agentReward";
import { sendBookingNotification } from "@/lib/telegram";

// Правила заявки — одни на все двери (25.08.2026).
//
// Дверей стало две: форма на сайте (api/bookings) и кабинет агента, где агент
// записывает гостя сам. Правила при этом одинаковые — проверить телефон,
// обрезать текст, не сохранить мусорный реф-код, положить пожелания в заметку и
// сказать в Telegram. Держать их в двух местах нельзя: разъедутся в первый же
// раз, когда правило поменяют в одном.
//
// Что осталось за пределами этого файла и почему: honeypot и ограничение по
// IP — защита от ботов, она нужна только публичной форме. У агента заявку
// заводит залогиненный человек с ролью — от кого там защищаться.

export interface NewBooking {
  clientName: string;
  contact: string; // телефон, как ввёл человек
  telegram?: string | null;
  messenger?: string | null; // WhatsApp / Telegram / Zalo
  serviceId?: string | null;
  preferredDate?: string | null; // 'YYYY-MM-DD'
  comment?: string | null;
  refCode?: string | null;
  src?: string | null;
  utm?: Record<string, string>;
}

export type BookingResult =
  | { ok: true; bookingNo: number | null; refAccepted: boolean }
  | { ok: false; error: "missing_fields" | "bad_phone" | "db_error" };

// Похоже на uuid (id услуги)? Если нет — не рискуем нарушить связь с таблицей
// услуг и просто не проставляем услугу.
function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

// Обрезка текстовых полей (ревизия безопасности 2026-08-07). Форму заполняет
// не только человек: имя, комментарий и метки источника писались в базу как
// есть — то есть скриптом туда заливался хоть мегабайт текста на каждую заявку.
// Живому гостю этих длин хватает с запасом, поэтому режем молча, а не
// отказываем: настоящий человек с длинным вопросом не должен получить «ошибку»
// вместо записи.
export function trimField(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  return s ? s.slice(0, max) : null;
}

// Настоящий ли это день календаря. Одной проверки формата мало: «2026-13-99»
// выглядит как дата, но такого дня нет — Postgres отвечает ошибкой, и гость
// видит «заявка не сохранилась» вместо записи.
export function isRealDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const d = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === day;
}

// Создать заявку: проверить, записать, сказать в Telegram.
//
// Пишем под service_role: заявку заводят и незалогиненные гости с сайта, а
// сама таблица закрыта RLS.
export async function createBooking(input: NewBooking): Promise<BookingResult> {
  const clientName = trimField(input.clientName, 100);
  const contact = trimField(input.contact, 40);
  // Без имени и контакта заявка бессмысленна.
  if (!clientName || !contact) return { ok: false, error: "missing_fields" };

  // Телефон проверяем на сервере, а не только в форме: проверку на клиенте
  // обходит кто угодно, а заявка без рабочего номера — это клиент, до которого
  // школа не дозвонится, и узнают об этом через сутки.
  if (!isValidPhone(contact)) return { ok: false, error: "bad_phone" };

  const serviceId =
    input.serviceId && isUuid(input.serviceId) ? input.serviceId : null;
  const messenger = trimField(input.messenger, 40);
  const comment = trimField(input.comment, 1000);
  const preferredDateRaw = trimField(input.preferredDate, 10);
  const preferredDate =
    preferredDateRaw && isRealDay(preferredDateRaw) ? preferredDateRaw : null;
  const refCode = trimField(input.refCode, 32);
  const src = trimField(input.src, 64);

  // Канал связи и комментарий клиента кладём в internal_note (стартовая
  // заметка для админа; дальше он ведёт в ней договорённости с клиентом).
  // Отдельных колонок в схеме нет, а терять пожелания клиента нельзя.
  const noteParts: string[] = [];
  if (messenger) noteParts.push(`Связь: ${messenger}`);
  if (comment) noteParts.push(`Клиент: ${comment}`);
  const internalNote = noteParts.join(" · ") || null;

  const supabase = createAdminClient();

  // Реф-код проверяем ДО записи заявки. Раньше он писался в базу как есть:
  // ссылка с опечаткой или код давно удалённого агента оседали в заявке
  // навсегда, админ видел «владелец не найден», а сам код жил ещё 30 дней в
  // браузере гостя и лез в каждую следующую заявку с того же устройства.
  // Не нашли владельца — код не сохраняем; src и utm при этом остаются,
  // откуда пришёл гость, мы всё равно знаем.
  let refOwner: RefOwner | undefined;
  if (refCode) {
    refOwner = (await resolveRefOwners(supabase, [refCode])).get(refCode);
  }
  const storedRefCode = refOwner ? refCode : null;

  // Сразу забираем присвоенный номер — покажем его клиенту на /thanks.
  const { data: created, error } = await supabase
    .from("bookings")
    .insert({
      client_name: clientName,
      // Храним цифрами: так заявка сматчится с карточкой клиента по телефону
      // (phonesMatch сравнивает хвост), как бы гость ни расставил пробелы.
      phone: phoneDigits(contact) || contact,
      telegram_username: normalizeTelegram(input.telegram ?? undefined),
      service_id: serviceId,
      preferred_date: preferredDate,
      ref_code: storedRefCode,
      src,
      utm: input.utm ?? {},
      internal_note: internalNote,
    })
    .select("booking_no")
    .single();

  if (error) {
    console.error("[bookings] insert error:", error.message);
    return { ok: false, error: "db_error" };
  }

  // Уведомление в Telegram. Для красивого текста подтянем название услуги.
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

  return {
    ok: true,
    bookingNo: created?.booking_no ?? null,
    // Говорит форме, что делать с кодом в браузере гостя: false — код
    // мусорный, форма его забудет, чтобы он не тащился в следующие заявки.
    refAccepted: refCode ? Boolean(refOwner) : true,
  };
}
