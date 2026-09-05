import { test } from "node:test";
import assert from "node:assert/strict";
import { getCrmPayout, getFinance } from "@/lib/finance";
import { getSessionShare, getSubsShares } from "@/lib/salary";
import { getDayPayments } from "@/lib/payments";
import { getMonthlyPayroll, getPayoutHistory } from "@/lib/payroll";
import { vnPeriod } from "@/lib/dates";

const range = vnPeriod("2026-09-01", "2026-09-05");
type Db = Parameters<typeof getFinance>[0];

function fakeDb(failingTable?: string, secondPage = false): Db {
  return {
    from(table: string) {
      let offset = 0;
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "eq", "not", "gte", "lt", "lte", "gt", "in", "order", "is"]) {
        chain[method] = () => chain;
      }
      chain.range = (start: number) => { offset = start; return chain; };
      chain.then = (resolve: (value: unknown) => unknown) => {
        const fails = table === failingTable && (!secondPage || offset > 0);
        return Promise.resolve({
          data: fails ? null : secondPage && table === "sessions" && offset === 0
            ? Array.from({ length: 1000 }, () => ({ amount: 100, agent_commission: 0 })) : [],
          error: fails ? { message: `${table} unavailable` } : null,
        }).then(resolve);
      };
      return chain;
    },
  } as unknown as Db;
}

const cases: [string, (db: Db) => Promise<unknown>, string[]][] = [
  ["доля CRM", (db) => getCrmPayout(db, range), ["sessions", "subscriptions"]],
  ["зарплата занятий", (db) => getSessionShare(db, range, ["staff"]), ["sessions", "shifts"]],
  ["котёл абонементов", (db) => getSubsShares(db, range, []), ["subscriptions", "shifts"]],
  ["финансы школы", (db) => getFinance(db, range), ["sessions", "subscriptions", "expenses", "users", "shifts", "salary_payouts", "agent_payouts"]],
  ["оплаты дня", (db) => getDayPayments(db, range.fromDay), ["sessions", "subscriptions"]],
  ["расчёт выплат", (db) => getMonthlyPayroll(db, range), ["agents", "referral_rewards"]],
  ["история выплат", (db) => getPayoutHistory(db), ["users", "agents"]],
];
for (const [name, calculate, tables] of cases) {
  for (const table of tables) {
    test(`${name}: сбой ${table} останавливает расчёт`, async () => {
      await assert.rejects(calculate(fakeDb(table)), new RegExp(`${table} unavailable`));
    });
  }
}

test("ошибка второй страницы занятий не превращает частичную выручку в итог", async () => {
  await assert.rejects(getCrmPayout(fakeDb("sessions", true), range), /sessions unavailable/);
});

test("успешно прочитанная пустая база даёт настоящий ноль", async () => {
  assert.equal((await getCrmPayout(fakeDb(), range)).total, 0);
  assert.equal((await getDayPayments(fakeDb(), range.fromDay)).total, 0);
  assert.equal((await getFinance(fakeDb(), range)).cashLeft, 0);
});
