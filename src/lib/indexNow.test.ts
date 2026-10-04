import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { INDEXNOW_KEY, indexNowEnabled, indexNowPayload } from "@/lib/indexNow";

// IndexNow (журнал, этап 4). Запуск: npm test

test("файл с ключом лежит в public и совпадает с ключом в коде", () => {
  assert.match(INDEXNOW_KEY, /^[0-9a-f]{32}$/);
  assert.equal(readFileSync(`public/${INDEXNOW_KEY}.txt`, "utf8").trim(), INDEXNOW_KEY);
});

test("в запрос уходят только свои адреса, без повторов", () => {
  const p = indexNowPayload([
    "https://www.flyguru.pro/journal/post",
    "https://www.flyguru.pro/journal/post",
    "https://www.flyguru.pro/journal",
    "https://evil.example/journal",
  ]);
  assert.equal(p.host, "www.flyguru.pro");
  assert.equal(p.keyLocation, `https://www.flyguru.pro/${INDEXNOW_KEY}.txt`);
  assert.deepEqual(p.urlList, [
    "https://www.flyguru.pro/journal/post",
    "https://www.flyguru.pro/journal",
  ]);
});

test("шлём только с боевого сайта", () => {
  assert.equal(indexNowEnabled({ VERCEL_ENV: "production" }), true);
  assert.equal(indexNowEnabled({ VERCEL_ENV: "preview" }), false);
  assert.equal(indexNowEnabled({}), false);
});
