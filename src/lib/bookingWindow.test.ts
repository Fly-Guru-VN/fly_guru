import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bookingDeadlineMs,
  canBookOn,
  canCancelBooking,
  firstBookableDay,
  parseTimeText,
  vnMomentMs,
} from "@/lib/bookingWindow";

// Окна брони и отмены (правила начальника от 30.08.2026). Запуск: npm test
//
// Проверять это глазами нельзя: правило завязано на вьетнамский часовой пояс,
// а сервер живёт в UTC. Ошибка на 7 часов не видна в интерфейсе вообще — она
// просто однажды закроет запись в час дня или откроет в три ночи.

// Удобные точки времени: «столько-то по Нячангу такого-то дня».
const vn = (day: string, hhmm: string) => vnMomentMs(day, hhmm)!;

test("вьетнамское время переводится в UTC со сдвигом −7 часов", () => {
  assert.equal(vn("2026-09-01", "07:00"), Date.parse("2026-09-01T00:00:00.000Z"));
  assert.equal(vn("2026-09-01", "00:00"), Date.parse("2026-08-31T17:00:00.000Z"));
});

test("крайний срок брони — 20:00 предыдущего дня по Нячангу", () => {
  assert.equal(bookingDeadlineMs("2026-09-02"), vn("2026-09-01", "20:00"));
});

test("до 20:00 записаться на завтра можно, после — уже нет", () => {
  // 19:59 первого сентября: бронь на второе принимается.
  assert.equal(canBookOn("2026-09-02", vn("2026-09-01", "19:59")), true);
  // Ровно в 20:00 — последняя минута, когда ещё можно.
  assert.equal(canBookOn("2026-09-02", vn("2026-09-01", "20:00")), true);
  // 20:01 — поздно.
  assert.equal(canBookOn("2026-09-02", vn("2026-09-01", "20:01")), false);
});

test("на сегодня записаться нельзя никогда — срок прошёл вчера", () => {
  assert.equal(canBookOn("2026-09-01", vn("2026-09-01", "06:00")), false);
});

test("послезавтра доступно и после дедлайна на завтра", () => {
  assert.equal(canBookOn("2026-09-03", vn("2026-09-01", "23:30")), true);
});

test("ближайший доступный день: до 20:00 — завтра, после — послезавтра", () => {
  assert.equal(firstBookableDay(vn("2026-09-01", "10:00")), "2026-09-02");
  assert.equal(firstBookableDay(vn("2026-09-01", "20:30")), "2026-09-03");
  // Граница суток по Нячангу: 00:30 второго сентября — это ещё «до 20:00»
  // второго, значит ближайший день — третье.
  assert.equal(firstBookableDay(vn("2026-09-02", "00:30")), "2026-09-03");
});

test("отменить можно не позже чем за час до начала", () => {
  const start = "09:00";
  assert.equal(canCancelBooking("2026-09-02", start, vn("2026-09-02", "07:30")), true);
  assert.equal(canCancelBooking("2026-09-02", start, vn("2026-09-02", "08:00")), true);
  assert.equal(canCancelBooking("2026-09-02", start, vn("2026-09-02", "08:01")), false);
  // После начала — тем более нельзя.
  assert.equal(canCancelBooking("2026-09-02", start, vn("2026-09-02", "10:00")), false);
});

test("без времени в записи отмена закрывается в полночь этого дня", () => {
  assert.equal(canCancelBooking("2026-09-02", null, vn("2026-09-01", "20:00")), true);
  assert.equal(canCancelBooking("2026-09-02", null, vn("2026-09-01", "23:30")), false);
  assert.equal(canCancelBooking(null, "09:00", vn("2026-09-01", "10:00")), false);
});

test("время из свободного текста заявки", () => {
  assert.equal(parseTimeText("15:00"), "15:00");
  assert.equal(parseTimeText("9:30"), "09:30");
  assert.equal(parseTimeText("часов в 7:00 утра"), "07:00");
  assert.equal(parseTimeText("утром"), null);
  assert.equal(parseTimeText("99:99"), null);
  assert.equal(parseTimeText(null), null);
});
