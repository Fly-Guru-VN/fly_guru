import { test } from "node:test";
import assert from "node:assert/strict";
import { shiftHours, tenureLabel } from "@/lib/staffProfile";

// Профиль сотрудника: стаж и часы на сменах. Запуск: npm test

test("стаж: дни, месяцы, годы", () => {
  assert.equal(tenureLabel("2026-11-01", "2026-11-12"), "12 дн.");
  assert.equal(tenureLabel("2026-08-15", "2026-11-14"), "2 мес."); // 14 < 15
  assert.equal(tenureLabel("2026-08-15", "2026-11-15"), "3 мес.");
  assert.equal(tenureLabel("2025-09-01", "2026-11-15"), "1 г. 2 мес.");
  assert.equal(tenureLabel("2025-11-15", "2026-11-15"), "1 г.");
});

test("часы: только закрытые смены, забытое закрытие не считаем", () => {
  const h = shiftHours([
    { opened_at: "2026-11-14T01:00:00Z", closed_at: "2026-11-14T11:30:00Z" }, // 10,5 ч
    { opened_at: "2026-11-15T01:00:00Z", closed_at: null }, // идёт сейчас
    { opened_at: "2026-11-10T01:00:00Z", closed_at: "2026-11-12T11:00:00Z" }, // забыли закрыть
  ]);
  assert.equal(h, 10.5);
});
