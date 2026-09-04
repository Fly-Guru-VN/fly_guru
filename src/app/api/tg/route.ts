import { NextRequest, NextResponse } from "next/server";
import { linkTelegramAccount } from "@/lib/memberCabinet";
import { verifyWebhookSecret } from "@/lib/tgAuth";
import {
  CABINET_KEYBOARD,
  SHARE_PHONE_KEYBOARD,
  SUPPORT_URL,
  clientBotToken,
  sendClientMessage,
} from "@/lib/tgClientBot";

// Дверь для клиентского бота: сюда Telegram присылает всё, что человек пишет.
//
// Разговор с ботом короткий и всегда один и тот же:
//   1. человек нажал «Запустить» → просим номер штатной кнопкой;
//   2. человек нажал кнопку → запоминаем связь «телеграм ↔ клиент» и даём
//      постоянную кнопку «Кабинет»;
//   3. всё остальное → напоминаем, что делать.
//
// После успешной проверки секрета отвечаем 200 даже на исключение обработки:
// на другой код Telegram присылает то же обновление снова и снова. Ошибки при
// этом не глотаем — пишем в лог. Ошибка аутентификации, наоборот, получает
// 401, а отсутствие обязательного секрета в конфигурации — 503.

export const dynamic = "force-dynamic";

interface TgMessage {
  chat?: { id: number };
  from?: { id: number; first_name?: string; username?: string };
  text?: string;
  contact?: { phone_number?: string; user_id?: number };
}

const ok = () => NextResponse.json({ ok: true });

export async function POST(req: NextRequest) {
  if (!clientBotToken()) return ok();

  // Секретное слово в заголовке (задаётся при регистрации адреса у Telegram).
  // Fail-closed: если переменную забыли при деплое, не обрабатываем вообще ни
  // один update. 503 заставит настоящий Telegram повторить доставку после
  // исправления конфигурации; запрос с неверным секретом получает 401.
  const secret = process.env.TELEGRAM_CLIENT_BOT_SECRET;
  const receivedSecret = req.headers.get("x-telegram-bot-api-secret-token");
  if (!verifyWebhookSecret(secret, receivedSecret)) {
    if (!secret) {
      console.error("[tg-client] TELEGRAM_CLIENT_BOT_SECRET не задан — webhook закрыт");
      return NextResponse.json({ ok: false }, { status: 503 });
    }
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    const update = (await req.json()) as { message?: TgMessage };
    const msg = update.message;
    const chatId = msg?.chat?.id;
    const fromId = msg?.from?.id;
    if (!msg || !chatId || !fromId) return ok();

    // ── Человек прислал контакт ──────────────────────────────────────────────
    if (msg.contact) {
      // Кнопка «Поделиться номером» присылает СВОЙ контакт, и тогда user_id
      // равен отправителю. Но контакт можно переслать и чужой — из адресной
      // книги. Так человек привязал бы к себе чужой номер и открыл чужой
      // абонемент, поэтому чужие контакты не принимаем.
      if (msg.contact.user_id !== fromId) {
        await sendClientMessage(
          chatId,
          "Это чужой контакт. Нажмите кнопку «Поделиться номером» — Telegram пришлёт ваш собственный.",
          SHARE_PHONE_KEYBOARD,
        );
        return ok();
      }

      const { clientName } = await linkTelegramAccount({
        telegramId: fromId,
        phone: msg.contact.phone_number ?? "",
        username: msg.from?.username ?? null,
        firstName: msg.from?.first_name ?? null,
      });

      await sendClientMessage(
        chatId,
        clientName
          ? `Готово, ${clientName}. Кабинет открывается кнопкой «Кабинет» внизу — там остаток минут, запись и история.`
          : "Номер записал. Пока не нахожу вас среди наших гостей — если вы уже катались с нами, напишите в поддержку, свяжем вручную: " +
            SUPPORT_URL,
        CABINET_KEYBOARD,
      );
      return ok();
    }

    // ── /start и всё остальное ───────────────────────────────────────────────
    const text = (msg.text ?? "").trim();
    if (text.startsWith("/start")) {
      await sendClientMessage(
        chatId,
        "FlyGuru — ваш кабинет.\n\n" +
          "Здесь видно остаток минут абонемента, отсюда же бронируется катание и отменяется запись.\n\n" +
          "Чтобы я узнал вас, поделитесь номером телефона — тем самым, что вы оставляли при записи. Нажмите кнопку внизу, печатать ничего не надо.",
        SHARE_PHONE_KEYBOARD,
      );
      return ok();
    }

    await sendClientMessage(
      chatId,
      "Я умею немного: открыть кабинет по кнопке внизу. Если кнопки нет — отправьте /start и поделитесь номером.\n\n" +
        `Живой человек: ${SUPPORT_URL}`,
    );
    return ok();
  } catch (e) {
    console.error("[tg-client] webhook error:", e instanceof Error ? e.message : e);
    return ok();
  }
}
