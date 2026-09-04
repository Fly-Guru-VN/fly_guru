import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";
import { SITE_URL } from "@/lib/site";

// QR-код агентской ссылки — картинкой (17.08.2026, просьба начальника).
//
// Зачем. Агент — это гид или отельер: он показывает гостю телефон, наклейку на
// стойке или визитку. Скопированную ссылку в такой ситуации не продиктуешь,
// поэтому у каждой карточки агента в кабинете теперь есть QR: навёл камеру —
// попал на /r/<код>, где скидка и форма записи.
//
// Что внутри картинки: ровно тот же адрес, что даёт кнопка «Скопировать»
// (SITE_URL + /r/<код>). Никаких меток, счётчиков и сумм — переход всё равно
// запишется на лендинге (RefVisitLogger), и статистика агента посчитает его
// вместе с обычными кликами.
//
// Адрес открыт без входа: секрета в картинке нет, это публичная ссылка. Но
// рисуем мы её только для СУЩЕСТВУЮЩЕГО кода агента и с ограничителем — иначе
// сервер школы превращается в бесплатный генератор QR для чего угодно.
//
// ?download=1 — отдать файлом («Скачать QR» в карточке), без него картинка
// показывается прямо в кабинете.

export const runtime = "nodejs"; // библиотека рисует PNG средствами Node

const CODE_RE = /^[a-zA-Z0-9_-]{1,32}$/;
const MAX_PER_MINUTE = 30;
// 640 px хватает и на экран кабинета, и на печать наклейки: в коде всего
// десяток символов, точки крупные.
const SIZE = 640;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  if (!checkRateLimit(`agent-qr:${clientIp(req.headers)}`, MAX_PER_MINUTE)) {
    return new NextResponse("Слишком много запросов", { status: 429 });
  }

  const { code } = await params;
  if (!code || !CODE_RE.test(code)) {
    return new NextResponse("Плохой код", { status: 400 });
  }

  // Выключенного агента не отсекаем: его ссылка ведёт на обычную страницу
  // обучения, и напечатанный раньше QR не должен внезапно ломаться. А вот
  // чужой строки в базе нет — на неё и отвечаем «нет такой».
  const supabase = createAdminClient();
  const { data: agent, error: agentError } = await supabase
    .from("agents")
    .select("id")
    .eq("ref_code", code)
    .maybeSingle();
  if (agentError) {
    console.error("[agent qr] lookup error:", agentError.message);
    return new NextResponse("Сервис временно недоступен", { status: 503 });
  }
  if (!agent) return new NextResponse("Нет такого агента", { status: 404 });

  const png = await QRCode.toBuffer(`${SITE_URL}/r/${code}`, {
    type: "png",
    width: SIZE,
    margin: 2, // белое поле по краям: без него камеры хуже ловят код
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#ffffff" },
  });

  const download = req.nextUrl.searchParams.get("download") === "1";
  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      // Код агента не меняется, картинка по нему всегда одна и та же.
      "Cache-Control": "public, max-age=86400",
      "Content-Disposition": download
        ? `attachment; filename="flyguru-${code}.png"`
        : `inline; filename="flyguru-${code}.png"`,
    },
  });
}
