import { test } from "node:test";
import assert from "node:assert/strict";
import {
  certificateStatus,
  formatCertificateCode,
  normalizeCertificateCode,
  randomCertificateCode,
} from "@/lib/certificateCode";

// Подарочные сертификаты (0059). Запуск: npm test
//
// Проверяем то, от чего зависит, найдётся ли номер вообще: гость вводит его с
// бумажки — со своими пробелами, дефисами и строчными буквами, — а в базе он
// лежит в одном-единственном виде. Разойдись эти два представления, человек с
// настоящим сертификатом получит «такого номера нет».

test("номер приводится к одному виду, как бы его ни ввели", () => {
  assert.equal(normalizeCertificateCode("FG-7K3M-92QD"), "FG7K3M92QD");
  assert.equal(normalizeCertificateCode(" fg 7k3m 92qd "), "FG7K3M92QD");
  assert.equal(normalizeCertificateCode("fg7k3m92qd"), "FG7K3M92QD");
});

test("мусор вместо номера превращается в пустую строку", () => {
  assert.equal(normalizeCertificateCode("---"), "");
  assert.equal(normalizeCertificateCode(null), "");
  assert.equal(normalizeCertificateCode(undefined), "");
});

test("на бланк номер пишется с дефисами", () => {
  assert.equal(formatCertificateCode("FG7K3M92QD"), "FG-7K3M-92QD");
  // Свой номер нестандартной длины не калечим — показываем как есть.
  assert.equal(formatCertificateCode("PODAROK1"), "PODAROK1");
});

test("придуманный номер читается с бумаги без спорных знаков", () => {
  for (let i = 0; i < 50; i++) {
    const code = randomCertificateCode();
    assert.equal(code.length, 10);
    assert.match(code, /^FG[A-Z2-9]{8}$/);
    // Ноль/буква O и единица/буква I на бланке неразличимы.
    assert.doesNotMatch(code, /[O0I1]/);
  }
});

test("состояние сертификата: погашен важнее срока", () => {
  const now = Date.parse("2026-09-08T10:00:00Z");
  const future = "2026-12-08T10:00:00Z";
  const past = "2026-08-08T10:00:00Z";

  assert.equal(certificateStatus({ used_at: null, expires_at: future }, now), "active");
  assert.equal(certificateStatus({ used_at: null, expires_at: past }, now), "expired");
  // Погашенный просроченным не показываем: важно, что им уже воспользовались.
  assert.equal(
    certificateStatus({ used_at: "2026-08-01T10:00:00Z", expires_at: past }, now),
    "used",
  );
});

test("в последнюю секунду срока сертификат ещё живой, в первую после — нет", () => {
  const expires = "2026-12-08T10:00:00Z";
  const at = Date.parse(expires);
  assert.equal(certificateStatus({ used_at: null, expires_at: expires }, at - 1), "active");
  assert.equal(certificateStatus({ used_at: null, expires_at: expires }, at), "expired");
});
