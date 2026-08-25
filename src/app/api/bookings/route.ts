import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";
import { createBooking, trimField } from "@/lib/bookings";

// «Серверная дверь» для заявок с форм сайта. Форма шлёт сюда данные, здесь мы
// отбиваем ботов, а сами правила заявки (проверки, запись, уведомление в
// Telegram) живут в lib/bookings — по ним же заявку заводит кабинет агента.

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

  // 3. Всё остальное — общие правила заявки (lib/bookings).
  const result = await createBooking({
    clientName: trimField(body.clientName, 100) ?? "",
    contact: trimField(body.contact, 40) ?? "",
    telegram: body.telegram ?? null,
    messenger: body.messenger ?? null,
    serviceId: body.serviceId ?? null,
    preferredDate: body.preferredDate ?? null,
    comment: body.comment ?? null,
    refCode: body.ref_code ?? null,
    src: body.src ?? null,
    utm: cleanUtm(body.utm),
  });

  if (!result.ok) {
    const status = result.error === "db_error" ? 500 : 400;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }

  return NextResponse.json({
    ok: true,
    bookingNo: result.bookingNo,
    refAccepted: result.refAccepted,
  });
}
