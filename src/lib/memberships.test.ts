import { test } from "node:test";
import assert from "node:assert/strict";
import { ensureMembership } from "@/lib/memberships";

type UpsertCall = {
  row: Record<string, unknown>;
  options: Record<string, unknown>;
};

// Фальшивый клиент того же покроя, что в subscriptions.test.ts: настоящая
// функция проходит через свой контроль ошибок, но никуда не ходит.
function fakeAdmin(result: { data: { id: string }[] | null; error: { message: string } | null }) {
  const calls: UpsertCall[] = [];
  const admin = {
    from(table: string) {
      assert.equal(table, "memberships");
      return {
        upsert(row: Record<string, unknown>, options: Record<string, unknown>) {
          calls.push({ row, options });
          return {
            select() {
              return Promise.resolve(result);
            },
          };
        },
      };
    },
  } as unknown as Parameters<typeof ensureMembership>[0];
  return { admin, calls };
}

test("первый абонемент заводит членство", async () => {
  const { admin, calls } = fakeAdmin({ data: [{ id: "m-1" }], error: null });

  assert.equal(await ensureMembership(admin, "client-1"), "created");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].row, { client_id: "client-1" });
  // Без ignoreDuplicates повторная продажа перетирала бы дату вступления.
  assert.deepEqual(calls[0].options, { onConflict: "client_id", ignoreDuplicates: true });
});

test("дата вступления берётся от даты продажи, а не от «сейчас»", async () => {
  const { admin, calls } = fakeAdmin({ data: [{ id: "m-1" }], error: null });

  await ensureMembership(admin, "client-1", "2026-07-01T00:00:00.000Z");
  assert.deepEqual(calls[0].row, {
    client_id: "client-1",
    since: "2026-07-01T00:00:00.000Z",
  });
});

test("второй абонемент дубля не создаёт", async () => {
  // ON CONFLICT DO NOTHING возвращает пустой список вставленных строк.
  const { admin } = fakeAdmin({ data: [], error: null });

  assert.equal(await ensureMembership(admin, "client-1"), "existed");
});

test("ошибка базы не роняет продажу, а возвращается флагом", async () => {
  const { admin } = fakeAdmin({ data: null, error: { message: "нет связи" } });

  assert.equal(await ensureMembership(admin, "client-1"), "failed");
});

test("без клиента в базу не ходим вовсе", async () => {
  const { admin, calls } = fakeAdmin({ data: [], error: null });

  assert.equal(await ensureMembership(admin, ""), "failed");
  assert.equal(calls.length, 0);
});
