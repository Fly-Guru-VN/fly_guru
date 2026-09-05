import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveMember,
  toMemberBooking,
  toMemberVisit,
} from "@/lib/memberCabinet";

function identityDb(matches: { id: string; name: string }[], error: { message: string } | null = null) {
  const phone = "+7 990 123 45 67";
  const query: Record<string, unknown> = {};
  for (const method of ["select", "eq", "maybeSingle", "update"]) query[method] = () => query;
  query.then = (resolve: (value: unknown) => unknown) => Promise.resolve({
    data: { client_id: "old-wrong-client", phone }, error: null,
  }).then(resolve);
  return {
    from: () => query,
    rpc: async (name: string, params: unknown) => {
      assert.equal(name, "find_member_client_by_phone");
      assert.deepEqual(params, { p_phone: phone });
      return { data: matches, error };
    },
  } as unknown as Parameters<typeof resolveMember>[0];
}

test("старая привязка по хвосту телефона не сохраняет доступ", async () => {
  assert.deepEqual(await resolveMember(identityDb([]), 123), {
    state: "no_client", phone: "+7 990 123 45 67",
  });
});

test("две карточки с полным номером не выбираются наугад", async () => {
  const result = await resolveMember(identityDb([
    { id: "one", name: "Один" }, { id: "two", name: "Два" },
  ]), 123);
  assert.ok("state" in result && result.state === "no_client");
});

test("полное совпадение заменяет ошибочный кэш client_id", async () => {
  assert.deepEqual(await resolveMember(identityDb([{ id: "correct", name: "Клиент" }]), 123), {
    clientId: "correct", clientName: "Клиент",
  });
});

test("сбой поиска номера не разрешает использовать старый client_id", async () => {
  await assert.rejects(resolveMember(identityDb([], { message: "lookup unavailable" }), 123), /lookup unavailable/);
});

test("кабинет заявки возвращает public_note и не протаскивает internal_note", () => {
  const row = {
    id: "booking-1",
    booking_no: 42,
    preferred_date: "2026-09-10",
    scheduled_time: "09:00",
    status: "confirmed",
    public_note: "Хочу жилет побольше",
    internal_note: "VIP, не показывать клиенту",
    services: { name: "Самостоятельное катание" },
  };

  const booking = toMemberBooking(row);
  assert.equal(booking.note, "Хочу жилет побольше");
  assert.equal(JSON.stringify(booking).includes("VIP"), false);
});

test("история не возвращает служебное sessions.note", () => {
  const row = {
    date: "2026-09-01",
    minutes_used: 30,
    public_note: null,
    note: "Опоздал, спор по оплате",
    services: { name: "Самостоятельное катание" },
  };

  const visit = toMemberVisit(row);
  assert.equal(visit.note, null);
  assert.equal(JSON.stringify(visit).includes("спор по оплате"), false);
});

test("ошибка чтения Telegram-связи не подменяется состоянием no_phone", async () => {
  const result = {
    data: null,
    error: { message: "client_telegram unavailable" },
  };
  const query: Record<string, unknown> = {};
  for (const method of ["select", "eq", "maybeSingle"]) {
    query[method] = () => query;
  }
  query.then = (
    resolve: (value: typeof result) => unknown,
    reject: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  const supabase = {
    from: () => query,
  } as unknown as Parameters<typeof resolveMember>[0];

  await assert.rejects(
    () => resolveMember(supabase, 123),
    /не удалось прочитать связь Telegram с клиентом/,
  );
});
