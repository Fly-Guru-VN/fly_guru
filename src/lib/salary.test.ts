import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEV_WEEK_PAY,
  getMonthlyFixedPay,
  MECHANIC_MONTH_PAY,
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
): StaffMember => ({
  id,
  name: id,
  role: "instructor",
  hiredAt: null,
  leftAt: null,
  senior: false,
  ...extra,
});

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
  // «Со скольких абонементов посчиталась доля» — не то же самое, что «продал
  // сам»: Михаил не продал ни одного, но за 4-е число доля ему причитается,
  // а за 6-е (уже уволен) — нет. У «a» обе цифры по два, но по разным причинам.
  assert.equal(shares.sharedCount.get("misha"), 1);
  assert.equal(shares.sharedCount.get("b"), 2);
  assert.equal(shares.sharedCount.get("a"), 2);
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

test("абонемент админа с галочкой «в общий котёл» делят инструкторы", async () => {
  // 0048: продажу босса можно отдать ребятам. Делится она как инструкторская —
  // между теми, кто был в штате в день ОПЛАТЫ, а сам босс доли не получает.
  const db = fakeDb({
    subscriptions: [
      {
        price: 6_000_000,
        paid_at: "2026-08-04T03:00:00Z",
        sold_by: "boss",
        pool_share: true,
      },
    ],
  });

  const crew = [staff("a"), staff("b")];
  const shares = await getSubsShares(db, vnPeriod("2026-08-01", "2026-08-10"), crew);
  assert.equal(shares.pool, 900_000); // 6 000 000 × 15%
  assert.equal(shares.shares.get("a"), 450_000);
  assert.equal(shares.shares.get("b"), 450_000);
  assert.equal(shares.shares.get("boss"), undefined);
  // Справка «сам продал N штук» — только про полевые продажи.
  assert.equal(shares.soldCount.size, 0);
  // А вот в дележе абонемент участвовал: обоим он засчитывается в объяснение
  // суммы, хотя своими руками они ничего не продавали.
  assert.equal(shares.sharedCount.get("a"), 1);
  assert.equal(shares.sharedCount.get("b"), 1);
  assert.equal(shares.sharedCount.get("boss"), undefined);
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

// ── СММщик на смене: считается как инструктор (21.08.2026) ───────────────────

test("СММщик, открывший смену, получает выход и долю 15% наравне с инструктором", async () => {
  const db = fakeDb({
    shifts: [
      {
        date: "2026-08-10",
        instructor_id: "instr",
        opened_at: vn("2026-08-10", "08:30"),
        closed_at: vn("2026-08-10", "18:30"),
      },
      {
        date: "2026-08-10",
        instructor_id: "roma", // СММщик вышел на пляж
        opened_at: vn("2026-08-10", "08:40"),
        closed_at: vn("2026-08-10", "18:20"),
      },
    ],
    sessions: [
      { date: "2026-08-10", amount: 4_000_000, agent_commission: 0, instructor_id: "instr" },
    ],
  });
  const range = vnPeriod("2026-08-10", "2026-08-10");

  const pay = await getShiftPay(db, range, ["instr", "roma"]);
  assert.equal(pay.get("roma")?.amount, SHIFT_PAY);

  // База дня 4 000 000 × 15% = 600 000 — пополам на двоих вышедших.
  const share = await getSessionShare(db, range, ["instr", "roma"]);
  assert.equal(share.get("roma")?.amount, 300_000);
  assert.equal(share.get("instr")?.amount, 300_000);
});

test("котёл абонементов делится с СММщиком только за дни его смен", async () => {
  const crew = [staff("instr"), staff("roma", { role: "smm" })];
  const db = fakeDb({
    subscriptions: [
      // 10-го СММщик на смене — делим пополам; 11-го он в офисе — всё инструктору.
      { price: 6_000_000, paid_at: "2026-08-10T03:00:00Z", sold_by: "instr" },
      { price: 6_000_000, paid_at: "2026-08-11T03:00:00Z", sold_by: "instr" },
    ],
    shifts: [
      {
        date: "2026-08-10",
        instructor_id: "roma",
        opened_at: vn("2026-08-10", "08:40"),
        closed_at: vn("2026-08-10", "18:20"),
      },
      // 11-го смена назначена, но не открыта: в офисе — значит доли нет.
      { date: "2026-08-11", instructor_id: "roma", opened_at: null, closed_at: null },
    ],
  });

  const shares = await getSubsShares(db, vnPeriod("2026-08-10", "2026-08-11"), crew);
  assert.equal(shares.pool, 1_800_000); // 15% с двух абонементов
  assert.equal(shares.shares.get("roma"), 450_000); // только за 10-е
  assert.equal(shares.shares.get("instr"), 450_000 + 900_000);
});

// ── Оклад механика: 10 млн за ЗАКРЫТЫЙ месяц ─────────────────────────────────

test("два закрытых месяца — два оклада, идущий месяц в долг не идёт", () => {
  // «Сегодня» здесь — реальная дата, поэтому берём период заведомо в прошлом.
  const pay = getMonthlyFixedPay(MECHANIC_MONTH_PAY, "2026-06-01", "2026-07-31");
  assert.equal(pay.months, 2);
  assert.equal(pay.amount, 20_000_000);
  assert.equal(pay.current, 0);
});

test("принятому в середине месяца оклад считается по отработанным дням", () => {
  // Вышел 16 июня: 15 дней из 30 — половина оклада.
  const member = staff("mech", { role: "mechanic", hiredAt: "2026-06-16" });
  const pay = getMonthlyFixedPay(MECHANIC_MONTH_PAY, "2026-06-01", "2026-06-30", member);
  assert.equal(pay.months, 1);
  assert.equal(pay.amount, 5_000_000);
});

test("уволенному месяц закрывается днём увольнения, а не концом месяца", () => {
  // Последний рабочий день 10 июля: 10 дней из 31.
  const member = staff("mech", { role: "mechanic", leftAt: "2026-07-10" });
  const pay = getMonthlyFixedPay(MECHANIC_MONTH_PAY, "2026-07-01", "2026-07-31", member);
  assert.equal(pay.months, 1);
  assert.equal(pay.amount, Math.round((10_000_000 * 10) / 31));
});
