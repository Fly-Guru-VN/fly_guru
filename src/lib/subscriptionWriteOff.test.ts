import { test } from "node:test";
import assert from "node:assert/strict";
import { writeOffSubscription } from "@/lib/subscriptionWriteOff";

const input = {
  subscriptionId: "sub", minutes: 40, date: "2026-09-05",
  instructorId: "instructor", actorId: "actor", note: "2 райдера",
};
type Db = Parameters<typeof writeOffSubscription>[0];

test("списание вызывает только атомарный RPC и возвращает его остаток", async () => {
  const db = {
    async rpc(name: string, params: unknown) {
      assert.equal(name, "write_off_subscription");
      assert.deepEqual(params, {
        p_subscription_id: "sub", p_minutes: 40, p_date: "2026-09-05",
        p_instructor_id: "instructor", p_actor_id: "actor", p_note: "2 райдера",
      });
      return { data: [{ left_minutes: 20 }], error: null };
    },
  } as unknown as Db;
  assert.deepEqual(await writeOffSubscription(db, input), { left: 20, error: null });
});

test("ошибка RPC не запускает неатомарный fallback", async () => {
  const db = { rpc: async () => ({ data: null, error: { message: "Остаток 20 мин" } }) } as unknown as Db;
  assert.match((await writeOffSubscription(db, input)).error ?? "", /Остаток 20/);
});

for (const minutes of [0, -1, 1.5, NaN, Infinity, 2147483648]) {
  test(`недопустимые минуты ${minutes} не доходят до RPC`, async () => {
    const result = await writeOffSubscription({} as Db, { ...input, minutes });
    assert.ok(result.error);
  });
}

for (const data of [null, [], [{ left_minutes: null }], [{ left_minutes: -1 }]]) {
  test(`неподтверждённое списание ${JSON.stringify(data)} не показывается успехом`, async () => {
    const db = { rpc: async () => ({ data, error: null }) } as unknown as Db;
    await assert.rejects(writeOffSubscription(db, input), /База не подтвердила/);
  });
}
