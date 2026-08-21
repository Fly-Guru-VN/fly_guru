import { test } from "node:test";
import assert from "node:assert/strict";
import {
  activeStaff,
  employedDuring,
  employmentLabel,
  isFired,
  worksOn,
  type StaffMember,
} from "@/lib/staff";

// Границы трудового периода (правка 19.08.2026). Проверяем ровно тот стык, из-за
// которого кнопка «Уволить» выглядела сломанной: увольнение сегодняшним днём
// должно убирать человека из штата СРАЗУ, но ЗП за этот день ему всё равно
// начисляется. Два разных ответа на «уволен?» и «работал в этот день?» —
// именно то, что легко сломать одной правкой, и на экране это не видно.

const member = (extra: Partial<StaffMember> = {}): StaffMember => ({
  id: "misha",
  name: "Михаил",
  role: "instructor",
  hiredAt: null,
  leftAt: null,
  senior: false,
  ...extra,
});

test("увольнение сегодняшним днём выводит из штата сразу", () => {
  const m = member({ leftAt: "2026-08-19" });
  assert.equal(isFired(m, "2026-08-19"), true);
  assert.equal(activeStaff([m], "2026-08-19").length, 0);
  assert.equal(employmentLabel(m, "2026-08-19"), "уволен 19 авг.");
});

test("последний рабочий день всё равно оплачивается", () => {
  const m = member({ leftAt: "2026-08-19" });
  assert.equal(worksOn(m, "2026-08-19"), true); // доли и ЗП за этот день идут
  assert.equal(worksOn(m, "2026-08-20"), false);
  // и в расчёт выплат за неделю увольнения он обязан попасть
  assert.equal(employedDuring(m, "2026-08-15", "2026-08-21"), true);
  assert.equal(employedDuring(m, "2026-08-22", "2026-08-28"), false);
});

test("дата увольнения в будущем оставляет человека в штате до неё", () => {
  const m = member({ leftAt: "2026-08-21" });
  assert.equal(isFired(m, "2026-08-19"), false);
  assert.equal(activeStaff([m], "2026-08-19").length, 1);
  assert.equal(employmentLabel(m, "2026-08-19"), "последний день 21 авг.");
});

test("не вышедший на работу в списки не попадает", () => {
  const m = member({ hiredAt: "2026-08-20" });
  assert.equal(activeStaff([m], "2026-08-19").length, 0);
  assert.equal(activeStaff([m], "2026-08-20").length, 1);
});
