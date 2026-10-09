import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FRIEND_SUBSCRIPTION_DISCOUNT,
  REFERRER_REWARD_MAX,
  friendSubscriptionPrice,
  referrerRewardFor,
} from "@/lib/referralTerms";

// Рефералы клиентов, условия с 09.10.2026. Запуск: npm test

test("рефу: тандем 10, базовое 20, абонемент 30 — только взрослые", () => {
  assert.equal(referrerRewardFor("tandem-adult", "tandem"), 10);
  assert.equal(referrerRewardFor("basic-adult", "training"), 20);
  assert.equal(referrerRewardFor("subscription", "subscription"), 30);
  // Продажа абонемента идёт без кода услуги — узнаём по категории.
  assert.equal(referrerRewardFor(null, "subscription"), 30);
  assert.equal(REFERRER_REWARD_MAX, 30);
});

test("за остальное рефу ничего", () => {
  for (const code of [
    "tandem-kid",
    "basic-kid",
    "basic-duo",
    "individual-training",
    "rental",
    "excursion",
    "safari",
    "video",
    "bonus-minutes",
    null,
    undefined,
    "",
  ]) {
    assert.equal(referrerRewardFor(code, "training"), 0, String(code));
  }
});

test("другу −1 млн на абонемент, не ниже нуля", () => {
  assert.equal(FRIEND_SUBSCRIPTION_DISCOUNT, 1_000_000);
  assert.equal(friendSubscriptionPrice(6_000_000), 5_000_000);
  assert.equal(friendSubscriptionPrice(500_000), 0);
});
