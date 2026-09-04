import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { verifyInitData, verifyWebhookSecret } from "@/lib/tgAuth";

// Вход в кабинет клиента без пароля. Запуск: npm test
//
// Здесь проверяется единственная дверь в чужой абонемент: если подпись Telegram
// можно подделать или подменить в ней id пользователя, то, зная чужой
// telegram_id, человек откроет чужой кабинет. Поэтому тест собирает initData
// сам — ровно так, как её собирает Telegram, — и пробует её испортить.

const TOKEN = "123456:TEST-TOKEN-НЕ-НАСТОЯЩИЙ";

// Собрать подписанную строку, как это делает Telegram.
function makeInitData(
  fields: Record<string, string>,
  token: string = TOKEN,
): string {
  const dcs = Object.entries(fields)
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  const hash = crypto.createHmac("sha256", secret).update(dcs).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}

const nowSec = () => Math.floor(Date.now() / 1000);
const user = (id: number) => JSON.stringify({ id, first_name: "Вася", username: "vasya" });

test("webhook принимает только точно совпавший настроенный секрет", () => {
  assert.equal(verifyWebhookSecret("длинный-секрет", "длинный-секрет"), true);
  assert.equal(verifyWebhookSecret("длинный-секрет", "чужой-секрет"), false);
  assert.equal(verifyWebhookSecret("длинный-секрет", "длинный-секрет-лишнее"), false);
});

test("webhook закрыт, если секрет не настроен или не пришёл", () => {
  assert.equal(verifyWebhookSecret(undefined, "что-угодно"), false);
  assert.equal(verifyWebhookSecret("", "что-угодно"), false);
  assert.equal(verifyWebhookSecret("длинный-секрет", null), false);
});

test("настоящая подпись Telegram принимается", () => {
  const initData = makeInitData({ user: user(777), auth_date: String(nowSec()) });
  const got = verifyInitData(initData, TOKEN);
  assert.equal(got?.id, 777);
  assert.equal(got?.username, "vasya");
});

test("подменённый id пользователя не проходит", () => {
  const initData = makeInitData({ user: user(777), auth_date: String(nowSec()) });
  // Меняем id уже ПОСЛЕ подписи — так выглядела бы попытка залезть в чужой
  // кабинет, зная чужой telegram_id.
  const forged = initData.replace(encodeURIComponent("777"), encodeURIComponent("888"));
  assert.notEqual(forged, initData);
  assert.equal(verifyInitData(forged, TOKEN), null);
});

test("подпись чужим токеном не проходит", () => {
  const initData = makeInitData({ user: user(777), auth_date: String(nowSec()) }, "999:ЧУЖОЙ");
  assert.equal(verifyInitData(initData, TOKEN), null);
});

test("вчерашняя строка не проходит — она протухла", () => {
  const old = String(nowSec() - 25 * 60 * 60);
  const initData = makeInitData({ user: user(777), auth_date: old });
  assert.equal(verifyInitData(initData, TOKEN), null);
});

test("мусор вместо подписи не роняет проверку", () => {
  assert.equal(verifyInitData("", TOKEN), null);
  assert.equal(verifyInitData("user=x&auth_date=1", TOKEN), null);
  assert.equal(verifyInitData("hash=нехекс&user=x&auth_date=1", TOKEN), null);
  // Без токена бота пускать некого.
  assert.equal(verifyInitData(makeInitData({ user: user(1), auth_date: String(nowSec()) }), ""), null);
});

test("строка без данных пользователя не проходит", () => {
  const initData = makeInitData({ auth_date: String(nowSec()) });
  assert.equal(verifyInitData(initData, TOKEN), null);
});
