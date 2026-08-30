import { test } from "node:test";
import assert from "node:assert/strict";
import { RIDERS_MAX, parseRiders, writeOffNote } from "@/lib/riders";

// Парное катание (правило начальника от 30.08.2026): с абонемента уходит
// длительность × число катавшихся одновременно. Запуск: npm test

test("число райдеров: мусор и выход за границы — это один человек", () => {
  assert.equal(parseRiders("2"), 2);
  assert.equal(parseRiders(3), 3);
  assert.equal(parseRiders(null), 1);
  assert.equal(parseRiders(""), 1);
  assert.equal(parseRiders("хочу больше"), 1);
  assert.equal(parseRiders(0), 1);
  assert.equal(parseRiders(-5), 1);
  // Больше максимума не списываем: ошибка в меньшую сторону безопаснее.
  assert.equal(parseRiders(99), RIDERS_MAX);
  assert.equal(parseRiders(2.9), 2);
});

test("примечание помечает парную каталку и не шумит на одиночной", () => {
  assert.equal(writeOffNote(1, ""), null);
  assert.equal(writeOffNote(1, "малое крыло"), "малое крыло");
  assert.equal(writeOffNote(2, ""), "2 райдера одновременно");
  assert.equal(writeOffNote(2, "ветер"), "2 райдера одновременно · ветер");
});
