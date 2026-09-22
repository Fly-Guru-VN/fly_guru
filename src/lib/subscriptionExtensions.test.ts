import { test } from "node:test";
import assert from "node:assert/strict";
import { getCrmPayout, getFinance, MARINA_RATE } from "@/lib/finance";
import { getDayPayments } from "@/lib/payments";
import { vnPeriod } from "@/lib/dates";
import { EXTENSION_PRICE, loadPaidSubscriptionMoney } from "@/lib/subscriptionExtensions";

// Продление (0062) — те же деньги, что продажа абонемента: оно обязано
// попадать в выручку, в базу 35% Marina и 2% CRM и в кассу по способам оплаты.

const range = vnPeriod("2026-09-22", "2026-09-22");
type Db = Parameters<typeof getFinance>[0];

const SUB = { price: 6_000_000, paid_at: "2026-09-22T03:00:00Z", sold_by: null, pool_share: false, payment_methods: { name: "Наличные" } };
const EXT = { price: EXTENSION_PRICE, paid_at: "2026-09-22T05:00:00Z", sold_by: null, pool_share: false, payment_methods: { name: "Перевод" } };

function fakeDb(): Db {
  return {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "eq", "not", "gte", "lt", "lte", "gt", "in", "order", "is", "range"]) {
        chain[method] = () => chain;
      }
      chain.then = (resolve: (value: unknown) => unknown) =>
        Promise.resolve({
          data: table === "subscriptions" ? [SUB] : table === "subscription_extensions" ? [EXT] : [],
          error: null,
        }).then(resolve);
      return chain;
    },
  } as unknown as Db;
}

test("помощник отдаёт абонементы и продления одним списком с пометкой", async () => {
  const rows = await loadPaidSubscriptionMoney<{ price: number }>(fakeDb(), "price", range);
  assert.deepEqual(
    rows.map((r) => [r.price, r.extension]),
    [[6_000_000, false], [EXTENSION_PRICE, true]],
  );
});

test("продление входит в выручку и в базу процентов", async () => {
  const total = 6_000_000 + EXTENSION_PRICE;
  const finance = await getFinance(fakeDb(), range);
  assert.equal(finance.paidSubsRevenue, total);
  assert.equal(finance.marina, total * MARINA_RATE);
  assert.equal((await getCrmPayout(fakeDb(), range)).revenue, total);
});

test("продление видно в кассе по способу оплаты", async () => {
  const day = await getDayPayments(fakeDb(), range.fromDay);
  assert.equal(day.total, 6_000_000 + EXTENSION_PRICE);
});
