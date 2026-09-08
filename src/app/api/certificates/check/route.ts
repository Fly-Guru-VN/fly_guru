import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";
import { normalizeCertificateCode } from "@/lib/certificateCode";
import { lookupCertificate } from "@/lib/certificates";

// Проверка номера сертификата из формы записи (0059).
//
// Наружу отдаём РОВНО название услуги и ничего больше: ни имени владельца, ни
// его телефона, ни срока. Номер сертификата — это ключ на предъявителя, и
// каждое лишнее поле здесь превращает форму записи в справочник «кому школа
// что продала».
//
// Частоту режем: перебирать номера по запросу в секунду нельзя дать никому.
// Пять в минуту, как у формы заявок, а не три: в отеле весь вайфай выходит в
// сеть под ОДНИМ адресом, и на трёх попытках второй гость с сертификатом уже
// упирался бы в «подождите минуту» из-за первого. Перебору эти два запроса
// ничего не дают — восемь знаков подбираются столетиями и на пяти, и на трёх.

const CHECKS_PER_MINUTE = 5;

export async function POST(req: NextRequest) {
  let body: { code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }

  if (!checkRateLimit(`certificates:${clientIp(req.headers)}`, CHECKS_PER_MINUTE)) {
    return NextResponse.json({ ok: false, reason: "rate_limited" }, { status: 429 });
  }

  const code = normalizeCertificateCode(body.code);
  if (!code) {
    return NextResponse.json({ ok: false, reason: "not_found" });
  }

  const found = await lookupCertificate(createAdminClient(), code);
  if (!found.ok) {
    const status = found.reason === "db_error" ? 500 : 200;
    return NextResponse.json({ ok: false, reason: found.reason }, { status });
  }

  return NextResponse.json({
    ok: true,
    serviceId: found.serviceId,
    serviceName: found.serviceName,
  });
}
