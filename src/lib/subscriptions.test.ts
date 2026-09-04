import { test } from "node:test";
import assert from "node:assert/strict";
import { minutesLeft } from "@/lib/subscriptions";

type QueryResult = {
  data: Record<string, number | null>[] | null;
  error: { message: string } | null;
};

// Для minutesLeft важен только маленький срез fluent API Supabase. Фальшивый
// клиент возвращает заранее заданный ответ для каждой таблицы, чтобы тест не
// зависел от сети и при этом проходил через настоящий контроль ошибок функции.
function fakeSupabase(results: Record<string, QueryResult>) {
  return {
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              return Promise.resolve(results[table]);
            },
          };
        },
      };
    },
  } as unknown as Parameters<typeof minutesLeft>[0];
}

test("остаток учитывает списания и ручные корректировки", async () => {
  const supabase = fakeSupabase({
    sessions: {
      data: [{ minutes_used: 30 }, { minutes_used: 45 }, { minutes_used: null }],
      error: null,
    },
    subscription_adjustments: {
      data: [{ delta_minutes: 20 }, { delta_minutes: -5 }],
      error: null,
    },
  });

  assert.equal(await minutesLeft(supabase, { id: "sub-1", total_minutes: 300 }), 240);
});

test("ошибка чтения списаний не подменяется нулём", async () => {
  const supabase = fakeSupabase({
    sessions: { data: null, error: { message: "sessions unavailable" } },
    subscription_adjustments: { data: [], error: null },
  });

  await assert.rejects(
    minutesLeft(supabase, { id: "sub-1", total_minutes: 300 }),
    /не удалось прочитать списания абонемента: sessions unavailable/,
  );
});

test("ошибка чтения корректировок не подменяется нулём", async () => {
  const supabase = fakeSupabase({
    sessions: { data: [], error: null },
    subscription_adjustments: {
      data: null,
      error: { message: "adjustments unavailable" },
    },
  });

  await assert.rejects(
    minutesLeft(supabase, { id: "sub-1", total_minutes: 300 }),
    /не удалось прочитать корректировки абонемента: adjustments unavailable/,
  );
});
