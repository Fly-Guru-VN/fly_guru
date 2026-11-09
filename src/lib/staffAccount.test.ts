import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generatePassword,
  isTechEmail,
  loginLabel,
  techEmailForPhone,
} from "@/lib/staffAccount";

// Вход сотрудника, который начальник заводит в «Настройках». Запуск: npm test
//
// Технический email должен совпадать с тем, что собирал scripts/create-user.mjs:
// иначе старые и новые входы по телефону разойдутся.

test("технический email собирается из цифр телефона", () => {
  assert.equal(techEmailForPhone("+84 90 123 4567"), "84901234567@phone.flyguru.local");
  assert.equal(techEmailForPhone("0901234567"), "0901234567@phone.flyguru.local");
  assert.ok(isTechEmail("0901234567@phone.flyguru.local"));
  assert.ok(!isTechEmail("boss@gmail.com"));
  assert.ok(!isTechEmail(null));
});

test("логин для показа: телефон важнее email, технический email не показываем", () => {
  assert.equal(loginLabel("+84 90 123 4567", "x@phone.flyguru.local"), "84901234567");
  assert.equal(loginLabel(null, "boss@gmail.com"), "boss@gmail.com");
  assert.equal(loginLabel(null, "84901234567@phone.flyguru.local"), null);
  assert.equal(loginLabel("", null), null);
});

test("пароль: заглавная, 5 строчных и 4 цифры без похожих символов, каждый раз новый", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const p = generatePassword();
    assert.match(p, /^[A-HJ-NP-Z][a-hjkmnp-z]{5}[2-9]{4}$/);
    seen.add(p);
  }
  assert.ok(seen.size > 190);
});
