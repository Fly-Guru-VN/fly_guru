import { test } from "node:test";
import assert from "node:assert/strict";
import { getSessionShare, getTourPay } from "@/lib/salary";
import { marinaBase } from "@/lib/finance";
import { vnPeriod } from "@/lib/dates";
import { parsePeople, tourPayFor, tourPricePerPerson, tourTotal } from "@/lib/tours";

// Правила туров (решение начальника от 06.10.2026). Запуск: npm test

type Rows = Record<string, Record<string, unknown>[]>;

function fakeDb(tables: Rows) {
  const chain = (rows: Record<string, unknown>[]) => {
    const self: Record<string, unknown> = {};
    for (const method of ["select", "eq", "not", "gte", "lt", "lte", "in", "order"]) {
      self[method] = () => self;
    }
    self.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null });
    return self;
  };
  return { from: (table: string) => chain(tables[table] ?? []) } as never;
}

const DAY = "2026-10-10";
const range = vnPeriod(DAY, DAY);
const opened = `${DAY}T08:00:00+07:00`;
const tour = (code: string) => ({ category: "tour", code });
const training = { category: "training", code: "basic-adult" };

test("цена экскурсии: от двух человек по 3 млн, у сафари и детской — по прайсу", () => {
  assert.equal(tourTotal("excursion", 3_500_000, 1), 3_500_000);
  assert.equal(tourTotal("excursion", 3_500_000, 2), 6_000_000);
  assert.equal(tourTotal("excursion", 3_500_000, 3), 9_000_000);
  assert.equal(tourPricePerPerson("safari", 6_000_000, 2), 6_000_000);
  assert.equal(tourPricePerPerson("excursion-kid", 2_500_000, 2), 2_500_000);
});

test("фикс за выезд: экскурсия и детская 1 млн, сафари 1,5 млн", () => {
  assert.equal(tourPayFor("excursion"), 1_000_000);
  assert.equal(tourPayFor("excursion-kid"), 1_000_000);
  assert.equal(tourPayFor("safari"), 1_500_000);
});

test("число людей: пусто — один, мусор и выход за границы — ошибка", () => {
  assert.equal(parsePeople(""), 1);
  assert.equal(parsePeople("3"), 3);
  assert.equal(parsePeople("0"), null);
  assert.equal(parsePeople("2.5"), null);
  assert.equal(parsePeople("50"), null);
});

test("тур не идёт в дележ 15% дня, обычное занятие — идёт", async () => {
  const db = fakeDb({
    sessions: [
      { date: DAY, amount: 6_000_000, agent_commission: 0, instructor_id: "a", service: tour("excursion") },
      { date: DAY, amount: 2_000_000, agent_commission: 0, instructor_id: "a", service: training },
    ],
    shifts: [
      { date: DAY, instructor_id: "a", opened_at: opened, closed_at: null },
      { date: DAY, instructor_id: "b", opened_at: opened, closed_at: null },
    ],
  });
  const share = await getSessionShare(db, range, ["a", "b"]);
  // Только 2 000 000 × 15% = 300 000 на двоих.
  assert.equal(share.get("a")?.amount, 150_000);
  assert.equal(share.get("b")?.amount, 150_000);
});

test("тур начальника в дни его выхода тоже не делится между сменщиками", async () => {
  const db = fakeDb({
    sessions: [
      { date: DAY, amount: 7_000_000, agent_commission: 0, instructor_id: "boss", service: tour("excursion") },
    ],
    shifts: [
      { date: DAY, instructor_id: "a", opened_at: opened, closed_at: null },
      { date: DAY, instructor_id: "boss", opened_at: opened, closed_at: null },
    ],
  });
  const share = await getSessionShare(db, range, ["a"], ["boss"]);
  assert.equal(share.get("a")?.amount ?? 0, 0);
});

test("фикс за тур получает тот, кто вёз, — за выезд, а не за людей", async () => {
  const db = fakeDb({
    sessions: [
      { date: DAY, instructor_id: "a", service: tour("excursion") }, // двое в одной сессии
      { date: DAY, instructor_id: "a", service: tour("safari") },
      { date: DAY, instructor_id: "b", service: tour("excursion-kid") },
      { date: DAY, instructor_id: "b", service: training },
    ],
  });
  const pay = await getTourPay(db, range, ["a", "b"]);
  assert.equal(pay.get("a")?.amount, 2_500_000);
  assert.equal(pay.get("a")?.count, 2);
  assert.equal(pay.get("b")?.amount, 1_000_000);
  assert.equal(pay.get("b")?.byDay.get(DAY), 1_000_000);
});

test("тур начальника сотрудникам не даёт ничего", async () => {
  const db = fakeDb({
    sessions: [{ date: DAY, instructor_id: "boss", service: tour("safari") }],
  });
  const pay = await getTourPay(db, range, ["a", "b"]);
  assert.equal(pay.size, 0);
});

test("Marina не берёт с туров, абонементы и занятия — как раньше", () => {
  const base = marinaBase(
    [
      { amount: 6_000_000, agent_commission: 0, service: { category: "tour" } },
      { amount: 2_000_000, agent_commission: 200_000, service: { category: "training" } },
      { amount: 0, agent_commission: 0, service: null }, // списание минут
    ],
    6_000_000,
  );
  assert.equal(base, 1_800_000 + 6_000_000);
});
