import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEV_WEEK_PAY,
  SHIFT_PAY,
  SMM_WEEK_PAY,
  getSessionShare,
  getShiftPay,
  getSmmFixedPay,
  getSubsShares,
  getWeeklyFixedPay,
  shiftPayStatus,
} from "@/lib/salary";
import { vnPeriod } from "@/lib/dates";
import type { StaffMember } from "@/lib/staff";

// Тесты денежных формул. Запуск: npm test
//
// Здесь проверяются ровно те правила, о которых договаривались с начальником и
// которые нельзя проверить глазами по экрану: дележ 15% между сменщиками,
// котёл абонементов по дню оплаты, регламент выхода и недельный фикс. Ошибка в
// любом из них — это недоплата живому человеку, которую замечают через неделю.
//
// База не нужна: функции читают её через переданный клиент, поэтому вместо
// Supabase подсовываем заглушку. Фильтры (.gte/.lt) она игнорирует — строки в
// каждом тесте и так только те, что попадают в период.

type Rows = Record<string, Record<string, unknown>[]>;

function fakeDb(tables: Rows) {
  const chain = (rows: Record<string, unknown>[]) => {
    const self: Record<string, unknown> = {};
    for (const method of ["select", "eq", "not", "gte", "lt", "lte", "in", "order"]) {
      self[method] = () => self;
    }
    self.then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: rows, error: null });
    return self;
  };
  // Форму клиента Supabase здесь не воспроизвести целиком — берём то, чем
  // формулы действительно пользуются.
  return { from: (table: string) => chain(tables[table] ?? []) } as never;
}

const staff = (
  id: string,
  extra: Partial<StaffMember> = {},
): StaffMember => ({ id, name: id, hiredAt: null, leftAt: null, senior: false, ...extra });

// Время в Нячанге (UTC+7) — пишем со смещением, чтобы тест не зависел от того,
// в каком поясе живёт машина.
const vn = (day: string, time: string) => `${day}T${time}:00+07:00`;

// ── Регламент выхода: 200 000 ₫ платим, только если открыл до 9:00 и закрыл
//    после 18:00 ──────────────────────────────────────────────────────────────

test("выход по регламенту зачтён", () => {
  assert.equal(
    shiftPayStatus(vn("2026-08-10", "08:30"), vn("2026-08-10", "18:30"), false),
    "paid",
  );
});

test("открыл после 9:00 — выход не зачтён", () => {
  assert.equal(
    shiftPayStatus(vn("2026-08-10", "09:15"), vn("2026-08-10", "18:30"), false),
    "lateOpen",
  );
});

test("закрыл до 18:00 — выход не зачтён", () => {
  assert.equal(
    shiftPayStatus(vn("2026-08-10", "08:00"), vn("2026-08-10", "17:30"), false),
    "earlyClose",
  );
});

test("смена не закрыта — платить не за что", () => {
  assert.equal(shiftPayStatus(vn("2026-08-10", "08:00"), null, false), "notClosed");
});

test("снятая админом премия перебивает идеальную смену", () => {
  assert.equal(
    shiftPayStatus(vn("2026-08-10", "08:00"), vn("2026-08-10", "19:00"), true),
    "cancelled",
  );
});

// ── Недельный фикс СММщика и разработчика: одна ставка за каждую субботу ─────
//
// Даты подобраны по августу 2026: субботы — 1, 8, 15, 22, 29 августа.

test("1—14 августа: две субботы — два фикса", () => {
  const pay = getSmmFixedPay("2026-08-01", "2026-08-14");
  assert.deepEqual(pay, {
    weeks: 2,
    nextPayday: "2026-08-15",
    amount: 2 * SMM_WEEK_PAY,
  });
});

test("день выплаты считается сразу: 15 августа — уже третий фикс", () => {
  const pay = getSmmFixedPay("2026-08-01", "2026-08-15");
  assert.deepEqual(pay, {
    weeks: 3,
    nextPayday: "2026-08-22",
    amount: 3 * SMM_WEEK_PAY,
  });
});

test("период без субботы фикса не даёт", () => {
  const pay = getSmmFixedPay("2026-08-16", "2026-08-21");
  assert.deepEqual(pay, {
    weeks: 0,
    nextPayday: "2026-08-22",
    amount: 0,
  });
});

test("уволенный не получает фикс за субботы после увольнения", () => {
  // Последний рабочий день — 7 августа: успела пройти только суббота 1-го.
  const pay = getWeeklyFixedPay(
    DEV_WEEK_PAY,
    "2026-08-01",
    "2026-08-16",
    staff("dev", { leftAt: "2026-08-07" }),
  );
  assert.deepEqual(pay, {
    weeks: 1,
    nextPayday: "2026-08-08",
    amount: DEV_WEEK_PAY,
  });
});

test("принятый в среду получает полный фикс в первую же субботу", () => {
  const pay = getWeeklyFixedPay(
    DEV_WEEK_PAY,
    "2026-08-01",
    "2026-08-16",
    staff("dev", { hiredAt: "2026-08-12" }),
  );
  assert.deepEqual(pay, {
    weeks: 1,
    nextPayday: "2026-08-22",
    amount: DEV_WEEK_PAY,
  });
});

// ── Дележ 15% с занятий дня ──────────────────────────────────────────────────

test("15% дня делятся между открывшими смену, а не между теми, кто записал", async () => {
  const db = fakeDb({
    sessions: [
      { date: "2026-08-10", amount: 1_000_000, agent_commission: 0, instructor_id: "a" },
    ],
    shifts: [
      { date: "2026-08-10", instructor_id: "a", opened_at: vn("2026-08-10", "08:00"), closed_at: null },
      { date: "2026-08-10", instructor_id: "b", opened_at: vn("2026-08-10", "08:00"), closed_at: null },
    ],
  });

  const share = await getSessionShare(db, vnPeriod("2026-08-10", "2026-08-10"), ["a", "b"]);
  // 1 000 000 × 15% = 150 000 на двоих.
  assert.equal(share.get("a")?.amount, 75_000);
  assert.equal(share.get("b")?.amount, 75_000);
  assert.equal(share.get("a")?.sharedDays, 1);
});

test("в день без смен каждый берёт 15% со своих чеков", async () => {
  const db = fakeDb({
    sessions: [
      { date: "2026-08-10", amount: 1_000_000, agent_commission: 0, instructor_id: "a" },
      { date: "2026-08-10", amount: 2_000_000, agent_commission: 0, instructor_id: "b" },
    ],
    shifts: [],
  });

  const share = await getSessionShare(db, vnPeriod("2026-08-10", "2026-08-10"), ["a", "b"]);
  assert.equal(share.get("a")?.amount, 150_000);
  assert.equal(share.get("b")?.amount, 300_000);
  assert.equal(share.get("a")?.ownDays, 1);
});

test("комиссия агента вычитается до дележа — с неё инструктору не идёт ничего", async () => {
  const db = fakeDb({
    sessions: [
      { date: "2026-08-10", amount: 1_000_000, agent_commission: 300_000, instructor_id: "a" },
    ],
    shifts: [],
  });

  const share = await getSessionShare(db, vnPeriod("2026-08-10", "2026-08-10"), ["a"]);
  assert.equal(share.get("a")?.amount, 105_000); // 700 000 × 15%
});

// ── Котёл абонементов: каждый делится между теми, кто был в штате в ДЕНЬ
//    ЕГО ОПЛАТЫ ────────────────────────────────────────────────────────────────

test("абонемент делится по составу штата на день оплаты", async () => {
  // Живой пример из правил: четверо, Михаила уволили 5-го (5-е он отработал).
  const crew = [
    staff("misha", { leftAt: "2026-08-05" }),
    staff("a"),
    staff("b"),
    staff("c"),
  ];
  const db = fakeDb({
    subscriptions: [
      { price: 6_000_000, paid_at: "2026-08-04T03:00:00Z", sold_by: "a" }, // 4-е, четверо
      { price: 6_000_000, paid_at: "2026-08-06T03:00:00Z", sold_by: "a" }, // 6-е, трое
    ],
  });

  const shares = await getSubsShares(db, vnPeriod("2026-08-01", "2026-08-10"), crew);
  // 15% с каждого абонемента = 900 000: сперва на четверых, потом на троих.
  assert.equal(shares.pool, 1_800_000);
  assert.equal(shares.shares.get("misha"), 225_000);
  assert.equal(shares.shares.get("b"), 225_000 + 300_000);
  assert.equal(shares.soldCount.get("a"), 2);
});

test("абонемент, проданный админом, в котёл инструкторов не идёт", async () => {
  const db = fakeDb({
    subscriptions: [
      { price: 6_000_000, paid_at: "2026-08-04T03:00:00Z", sold_by: "boss" },
    ],
  });

  const shares = await getSubsShares(db, vnPeriod("2026-08-01", "2026-08-10"), [staff("a")]);
  assert.equal(shares.pool, 0);
  assert.equal(shares.shares.size, 0);
});

// ── Выходы: 200 000 ₫ за каждый зачтённый ────────────────────────────────────

test("зачтённый выход стоит 200 000, будущая смена — ещё не выход", async () => {
  const db = fakeDb({
    shifts: [
      {
        date: "2026-08-10",
        instructor_id: "a",
        opened_at: vn("2026-08-10", "08:00"),
        closed_at: vn("2026-08-10", "18:30"),
        bonus_cancelled: false,
      },
      // Смена из графика, до которой ещё не дошло: не «нарушение», а просто
      // не наступивший день.
      { date: "2099-01-01", instructor_id: "a", opened_at: null, closed_at: null },
    ],
  });

  const pay = await getShiftPay(db, vnPeriod("2026-08-10", "2099-01-01"), ["a"]);
  assert.equal(pay.get("a")?.amount, SHIFT_PAY);
  assert.equal(pay.get("a")?.paidCount, 1);
  assert.equal(pay.get("a")?.unpaidCount, 0);
  assert.equal(pay.get("a")?.plannedCount, 1);
});

test("смена админа в ЗП инструкторов не попадает", async () => {
  const db = fakeDb({
    shifts: [
      {
        date: "2026-08-10",
        instructor_id: "boss",
        opened_at: vn("2026-08-10", "08:00"),
        closed_at: vn("2026-08-10", "18:30"),
      },
    ],
  });

  const pay = await getShiftPay(db, vnPeriod("2026-08-10", "2026-08-10"), ["a"]);
  assert.equal(pay.size, 0);
});
