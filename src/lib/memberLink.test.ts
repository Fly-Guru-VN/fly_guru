import { test } from "node:test";
import assert from "node:assert/strict";
import {
  matchClientsForLink,
  memberLinkUrl,
  newLinkCode,
  parseLinkStart,
} from "@/lib/memberLink";

test("код ссылки укладывается в правила start-параметра Telegram", () => {
  const code = newLinkCode();
  assert.match(code, /^[A-Za-z0-9_-]{16}$/);
  assert.notEqual(code, newLinkCode());
  const start = new URL(memberLinkUrl(code)).searchParams.get("start") ?? "";
  assert.ok(start.length <= 64);
  assert.equal(parseLinkStart(`/start ${start}`), code);
});

test("голый /start и чужие параметры — это обычный вход по номеру", () => {
  assert.equal(parseLinkStart("/start"), null);
  assert.equal(parseLinkStart("/start ref_abc12345"), null);
  assert.equal(parseLinkStart("/start link_short"), null);
  assert.equal(parseLinkStart("привет"), null);
});

const rows = [
  { id: "1", name: "Иван Петров", phone: "+84 90 123-45-67" },
  { id: "2", name: "Anna", phone: "0987 654 321" },
  { id: "3", name: "Иван Сидоров", phone: null },
];

test("клиента находят по куску номера, как бы он ни был записан", () => {
  assert.deepEqual(matchClientsForLink(rows, "1234567").map((c) => c.id), ["1"]);
  assert.deepEqual(matchClientsForLink(rows, "+84 90 123").map((c) => c.id), ["1"]);
  assert.deepEqual(matchClientsForLink(rows, "654").map((c) => c.id), ["2"]);
});

test("клиента находят по имени без учёта регистра", () => {
  assert.deepEqual(matchClientsForLink(rows, "иван").map((c) => c.id), ["1", "3"]);
  assert.deepEqual(matchClientsForLink(rows, "ANN").map((c) => c.id), ["2"]);
  assert.deepEqual(matchClientsForLink(rows, "и"), []);
});
