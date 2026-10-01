import { test } from "node:test";
import assert from "node:assert/strict";
import {
  activeStaff,
  employedDuring,
  employedSpan,
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

// 1% СММщика режется по датам работы (смена Ромы на Никиту, 01.10.2026).

test("уволенный 24 сентября: 1% только с 1 по 24 сентября", () => {
  const roma = member({ role: "smm", leftAt: "2026-09-24" });
  assert.deepEqual(employedSpan(roma, "2026-09-01", "2026-09-30"), {
    fromDay: "2026-09-01",
    lastDay: "2026-09-24",
  });
  assert.equal(employedSpan(roma, "2026-10-01", "2026-10-31"), null);
});

test("принятый 1 октября: октябрь целиком, сентябрь — ничего", () => {
  const nikita = member({ role: "smm", hiredAt: "2026-10-01" });
  assert.equal(employedSpan(nikita, "2026-09-01", "2026-09-30"), null);
  assert.deepEqual(employedSpan(nikita, "2026-10-01", "2026-10-31"), {
    fromDay: "2026-10-01",
    lastDay: "2026-10-31",
  });
});

test("принят и уволен внутри месяца — оба края обрезаны", () => {
  const m = member({ hiredAt: "2026-08-10", leftAt: "2026-08-20" });
  assert.deepEqual(employedSpan(m, "2026-08-01", "2026-08-31"), {
    fromDay: "2026-08-10",
    lastDay: "2026-08-20",
  });
});
