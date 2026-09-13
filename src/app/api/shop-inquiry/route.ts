import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";
import { trimField } from "@/lib/bookings";
import { isValidPhone } from "@/lib/phone";
import { buildShopInquiryText, resolveShopSelection } from "@/lib/shop";
import { sendShopInquiry } from "@/lib/telegram";

// «Серверная дверь» формы «Перезвоните мне» в магазине. Устроена как
// api/bookings, но проще: заявка не пишется в базу, а уходит сообщением в
// рабочий чат (этап 1 магазина — хранение и вкладку в админке добавим, если
// покупателей станет больше, чем можно удержать в чате).

interface ShopInquiryPayload {
  productId?: string | null; // пусто — «проконсультируйте», без товара
  sizeId?: string | null;
  colorId?: string | null;
  variantId?: string | null;
  clientName?: string;
  contact?: string;
  messenger?: string;
  comment?: string;
  locale?: string;
  honeypot?: string; // поле-ловушка: у живого человека всегда пустое
}

const MESSENGERS = new Set(["WhatsApp", "Telegram", "Zalo"]);

export async function POST(req: NextRequest) {
  let body: ShopInquiryPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  // Бот заполнил ловушку — отвечаем «успех» и ничего не шлём, как в заявках.
  if (body.honeypot && body.honeypot.trim() !== "") {
    return NextResponse.json({ ok: true });
  }

  if (!checkRateLimit(`shop:${clientIp(req.headers)}`)) {
    return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const clientName = trimField(body.clientName, 100);
  const contact = trimField(body.contact, 40);
  if (!clientName || !contact || !isValidPhone(contact)) {
    return NextResponse.json({ ok: false, error: "bad_contact" }, { status: 400 });
  }

  // Товар сверяем со справочником: название и цена в сообщении — наши, а не
  // присланные формой. Выдуманный товар — ошибка, а не «консультация»: гость
  // думал, что спрашивает про конкретную доску.
  const item = body.productId
    ? resolveShopSelection({
        productId: body.productId,
        sizeId: body.sizeId,
        colorId: body.colorId,
        variantId: body.variantId,
      })
    : null;
  if (body.productId && !item) {
    return NextResponse.json({ ok: false, error: "bad_product" }, { status: 400 });
  }

  const sent = await sendShopInquiry(
    buildShopInquiryText({
      item,
      clientName,
      contact,
      messenger: body.messenger && MESSENGERS.has(body.messenger) ? body.messenger : null,
      comment: trimField(body.comment, 1000),
      locale: body.locale ?? null,
    }),
  );
  if (!sent) {
    return NextResponse.json({ ok: false, error: "send_failed" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
