import { test } from "node:test";
import assert from "node:assert/strict";
import { subscriptionPriceFor } from "@/lib/subscriptionPrice";

// Решение начальника от 06.10.2026: член клуба берёт абонемент за 5 млн.
test("цена абонемента по умолчанию: 6 млн, члену клуба 5 млн", () => {
  assert.equal(subscriptionPriceFor(false), 6_000_000);
  assert.equal(subscriptionPriceFor(true), 5_000_000);
});
