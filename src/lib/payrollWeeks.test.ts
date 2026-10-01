import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPayWeeks, isUnderpaid, payWeekStart } from "@/lib/payrollWeeks";

// Недели карточки инструктора. Запуск: npm test
//
// Главный пример — живой: Никита, 1 октября 2026. На вкладке «осталось выдать
// 4 325 000», а за неделю он заработал 612 500 — и непонятно, откуда разница.
// Ручная сверка по неделям показала: за 12–18 сентября выплата не внесена.
// Ровно это карточка и должна показывать сама.

test("платёжная неделя начинается в субботу", () => {
  assert.equal(payWeekStart("2026-08-01"), "2026-08-01"); // суббота
  assert.equal(payWeekStart("2026-08-07"), "2026-08-01"); // пятница
  assert.equal(payWeekStart("2026-08-08"), "2026-08-08"); // суббота
  assert.equal(payWeekStart("2026-10-01"), "2026-09-26"); // четверг
});

// Заработок недели кладём одним числом на её вторник — для правила привязки
// неважно, в какой день он набежал.
const NIKITA_EARNED: [string, number][] = [
  ["2026-08-04", 3_800_000],
  ["2026-08-11", 3_450_000],
  ["2026-08-18", 4_900_000],
  ["2026-08-25", 5_575_000],
  ["2026-09-01", 2_275_000],
  ["2026-09-08", 2_425_000],
  ["2026-09-15", 2_637_500],
  ["2026-09-22", 2_175_000],
  ["2026-09-26", 1_225_000], // суббота и воскресенье текущей недели
  ["2026-09-29", 612_500], // пн–чт: те самые 612 500
];

const NIKITA_PAID: [string, number][] = [
  ["2026-08-07", 3_800_000], // пятница — за неделю, которая в этот день кончается
  ["2026-08-17", 3_450_000],
  ["2026-08-22", 4_900_000],
  ["2026-08-29", 5_575_000],
  ["2026-09-05", 2_425_000], // на 150 000 больше заработанного
  ["2026-09-15", 2_425_000], // вторник — за 5–11.09
  ["2026-09-27", 2_175_000], // воскресенье — за 19–25.09
];

function nikita() {
  return buildPayWeeks({
    epoch: "2026-08-01",
    today: "2026-10-01",
    earnedByDay: new Map(NIKITA_EARNED),
    payouts: NIKITA_PAID.map(([paidOn, amount], i) => ({
      id: String(i),
      paidOn,
      amount,
      comment: null,
    })),
  });
}

test("Никита: неделя 12–18 сентября без выплаты, остальные сходятся", () => {
  const weeks = nikita();
  const byStart = new Map(weeks.map((w) => [w.fromDay, w]));

  assert.equal(weeks.length, 9);
  assert.equal(byStart.get("2026-08-01")?.status, "paid");
  assert.equal(byStart.get("2026-09-05")?.status, "paid");
  assert.equal(byStart.get("2026-09-19")?.status, "paid");

  const hole = byStart.get("2026-09-12")!;
  assert.equal(hole.lastDay, "2026-09-18");
  assert.equal(hole.status, "missing");
  assert.equal(hole.diff, 2_637_500);

  const over = byStart.get("2026-08-29")!;
  assert.equal(over.status, "over");
  assert.equal(over.diff, -150_000);

  const running = byStart.get("2026-09-26")!;
  assert.equal(running.status, "running");
  assert.equal(running.earned, 1_837_500);

  assert.deepEqual(
    weeks.filter(isUnderpaid).map((w) => w.fromDay),
    ["2026-09-12"],
  );
});

test("сумма недель равна «осталось выдать» на вкладке", () => {
  const left = nikita().reduce((s, w) => s + w.diff, 0);
  assert.equal(left, 4_325_000);
});

test("выплата частью — неделя «выдано меньше»", () => {
  const [w] = buildPayWeeks({
    epoch: "2026-08-01",
    today: "2026-08-20",
    earnedByDay: new Map([["2026-08-03", 1_000_000]]),
    payouts: [{ id: "1", paidOn: "2026-08-08", amount: 400_000, comment: null }],
  });
  assert.equal(w.status, "short");
  assert.equal(w.diff, 600_000);
});

test("аванс до конца первой недели ложится на первую неделю", () => {
  const weeks = buildPayWeeks({
    epoch: "2026-08-01",
    today: "2026-08-20",
    earnedByDay: new Map([["2026-08-03", 1_000_000]]),
    payouts: [{ id: "1", paidOn: "2026-08-04", amount: 1_000_000, comment: null }],
  });
  assert.equal(weeks[0].status, "paid");
});

test("пятница — неделя ещё идёт, платить за неё рано", () => {
  const weeks = buildPayWeeks({
    epoch: "2026-08-01",
    today: "2026-08-07",
    earnedByDay: new Map([["2026-08-03", 1_000_000]]),
    payouts: [],
  });
  assert.equal(weeks.length, 1);
  assert.equal(weeks[0].status, "running");
});

test("неделя без заработка и выплат — пустая, не «не внесено»", () => {
  const weeks = buildPayWeeks({
    epoch: "2026-08-01",
    today: "2026-08-20",
    earnedByDay: new Map(),
    payouts: [],
  });
  assert.equal(weeks[0].status, "empty");
  assert.equal(weeks.filter(isUnderpaid).length, 0);
});
