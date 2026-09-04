import assert from "node:assert/strict";
import test from "node:test";
import { loginRateKey, passwordResetOrigin } from "./loginSecurity";
import { checkRateLimit, clientIp } from "./rateLimit";

test("ключ лимита не хранит логин и нормализует его формат", () => {
  const email = "Staff@FlyGuru.Pro";
  const emailKey = loginRateKey(email);
  assert.equal(emailKey, loginRateKey("staff@flyguru.pro"));
  assert.equal(emailKey.includes("staff"), false);

  assert.equal(loginRateKey("+84 90 123-45-67"), loginRateKey("84901234567"));
});

test("лимитер разрешает ровно заданное число попыток для одного ключа", () => {
  const key = `test-login-${crypto.randomUUID()}`;
  assert.equal(checkRateLimit(key, 2), true);
  assert.equal(checkRateLimit(key, 2), true);
  assert.equal(checkRateLimit(key, 2), false);
});

test("clientIp берёт первый адрес из цепочки прокси", () => {
  const headers = new Headers({ "x-forwarded-for": "203.0.113.8, 10.0.0.1" });
  assert.equal(clientIp(headers), "203.0.113.8");
});

test("ссылка сброса пароля в production не доверяет заголовку Host", () => {
  const headers = new Headers({
    host: "evil.example",
    "x-forwarded-proto": "javascript",
  });
  assert.equal(
    passwordResetOrigin(headers, "https://www.flyguru.pro/", true),
    "https://www.flyguru.pro",
  );
});

test("локальная разработка разрешает только loopback origin", () => {
  assert.equal(
    passwordResetOrigin(
      new Headers({ host: "localhost:3000" }),
      "https://www.flyguru.pro",
      false,
    ),
    "http://localhost:3000",
  );
  assert.equal(
    passwordResetOrigin(
      new Headers({ host: "preview.attacker.example" }),
      "https://www.flyguru.pro",
      false,
    ),
    "https://www.flyguru.pro",
  );
});
