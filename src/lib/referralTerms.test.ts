import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FRIEND_BONUS_MINUTES,
  FRIEND_BONUS_NOTE,
  REFERRER_REWARD_MINUTES,
  friendBonusApplies,
} from "@/lib/referralTerms";

// Рефералы клиентов (0063). Запуск: npm test

test("числа условий — как решил начальник", () => {
  assert.equal(REFERRER_REWARD_MINUTES, 20);
  assert.equal(FRIEND_BONUS_MINUTES, 10);
  assert.equal(FRIEND_BONUS_NOTE, "+10 мин по приглашению");
});

test("+10 минут другу — только обучение и абонемент", () => {
  assert.equal(friendBonusApplies("training"), true);
  assert.equal(friendBonusApplies("subscription"), true);
  for (const other of ["tandem", "rental", "tour", "extra", null, undefined, ""]) {
    assert.equal(friendBonusApplies(other), false, String(other));
  }
});
