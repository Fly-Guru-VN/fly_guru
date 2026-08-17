import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agentCommissionFor,
  agentDiscountFor,
  applyRefDiscount,
  asAgentPlan,
} from "@/lib/agentTerms";
import { netSessionsBase, MARINA_RATE, CRM_RATE } from "@/lib/finance";
import { SESSION_RATE } from "@/lib/salary";

// Тесты агентской схемы (решение David от 16.08.2026). Запуск: npm test
//
// Проверяем ровно то, что нельзя увидеть глазами на экране: какие суммы школа
// отдаёт гостю и агенту на каждой услуге и от какой базы считаются три доли.
// Ошибка здесь — это либо недоплата агенту, либо лишние деньги площадке.

// ── Скидка гостю ────────────────────────────────────────────────────────────

test("скидка есть только на базовом и парном обучении", () => {
  assert.equal(agentDiscountFor("basic-adult", 2_000_000), 100_000);
  assert.equal(agentDiscountFor("basic-duo", 3_500_000), 200_000);
  // Детское базовое, индивидуальное занятие, тандем: записаться по агентской
  // ссылке можно, но по обычной цене.
  assert.equal(agentDiscountFor("basic-kid", 1_500_000), 0);
  assert.equal(agentDiscountFor("individual-training", 1_500_000), 0);
  assert.equal(agentDiscountFor("tandem-adult", 1_500_000), 0);
  assert.equal(agentDiscountFor(null, 2_000_000), 0);
});

test("чек со скидкой и без", () => {
  assert.equal(applyRefDiscount(2_000_000, "basic-adult", true), 1_900_000);
  assert.equal(applyRefDiscount(3_500_000, "basic-duo", true), 3_300_000);
  // Скидка не положена (гость уже учился, ссылка инструкторская) — полная цена.
  assert.equal(applyRefDiscount(2_000_000, "basic-adult", false), 2_000_000);
  // Услуга без агентских условий — полная цена даже при положенной скидке.
  assert.equal(applyRefDiscount(1_500_000, "basic-kid", true), 1_500_000);
});

test("чек не уходит в минус, если цену опустили ниже скидки", () => {
  assert.equal(applyRefDiscount(50_000, "basic-adult", true), 0);
});

// ── Награда агенту ──────────────────────────────────────────────────────────

test("агент получает 200к за базовое и 300к за парное", () => {
  assert.equal(agentCommissionFor("basic-adult", 1_900_000), 200_000);
  assert.equal(agentCommissionFor("basic-duo", 3_300_000), 300_000);
  assert.equal(agentCommissionFor("basic-kid", 1_500_000), 0);
  assert.equal(agentCommissionFor("rental", 500_000), 0);
});

// ── Тариф «20% агенту, −5% гостю» (личная договорённость, 17.08.2026) ────────

test("процентный тариф: гостю 5% скидки, считается от цены услуги", () => {
  assert.equal(agentDiscountFor("basic-adult", 2_000_000, "pct-20"), 100_000);
  assert.equal(agentDiscountFor("basic-duo", 3_500_000, "pct-20"), 175_000);
  // Услуги вне договорённости — как у всех: полная цена.
  assert.equal(agentDiscountFor("basic-kid", 1_500_000, "pct-20"), 0);
  assert.equal(agentDiscountFor("tandem-adult", 2_500_000, "pct-20"), 0);
  // Цену услуги в базе могли не заполнить — процент считать не от чего.
  assert.equal(agentDiscountFor("basic-adult", null, "pct-20"), 0);
});

test("процентный тариф: агенту 20% с чека ПОСЛЕ скидки", () => {
  const check = applyRefDiscount(2_000_000, "basic-adult", true, "pct-20");
  assert.equal(check, 1_900_000);
  assert.equal(agentCommissionFor("basic-adult", check, "pct-20"), 380_000);

  const duo = applyRefDiscount(3_500_000, "basic-duo", true, "pct-20");
  assert.equal(duo, 3_325_000);
  assert.equal(agentCommissionFor("basic-duo", duo, "pct-20"), 665_000);
});

test("процентный тариф считает с суммы, вписанной руками", () => {
  // Админ дал свою цену (бронь, доплата, скидка сверх агентской) — 20% идут с
  // того, что реально попало в кассу.
  assert.equal(agentCommissionFor("basic-adult", 1_500_000, "pct-20"), 300_000);
  assert.equal(agentCommissionFor("basic-adult", 0, "pct-20"), 0);
});

test("донги округляются до тысяч", () => {
  // 5% от 1 111 111 = 55 555,55 → 56 000; 20% от 1 111 111 = 222 222,2 → 222 000.
  assert.equal(agentDiscountFor("basic-adult", 1_111_111, "pct-20"), 56_000);
  assert.equal(agentCommissionFor("basic-adult", 1_111_111, "pct-20"), 222_000);
});

test("неизвестный тариф из базы = стандартные условия", () => {
  // Строка в agents.terms_plan старше кода (или подделана формой): считаем по
  // условиям школы, а не по случайным числам.
  assert.equal(asAgentPlan("pct-20"), "pct-20");
  assert.equal(asAgentPlan("pct-99"), "standard");
  assert.equal(asAgentPlan(null), "standard");
  assert.equal(agentCommissionFor("basic-adult", 1_900_000, asAgentPlan("")), 200_000);
});

// ── База процентов: сначала минус агент, потом доли ─────────────────────────

test("все три доли считаются с чека за вычетом комиссии агента", () => {
  // Базовое по агентской ссылке: 2 000 000 − 100 000 скидки = гость платит
  // 1 900 000, из них 200 000 уходит агенту.
  const base = netSessionsBase([
    { amount: 1_900_000, agent_commission: 200_000 },
  ]);
  assert.equal(base, 1_700_000);
  assert.equal(base * MARINA_RATE, 595_000);
  assert.equal(base * SESSION_RATE, 255_000);
  assert.equal(base * CRM_RATE, 34_000);
});

test("занятие без агента считается со всего чека", () => {
  assert.equal(
    netSessionsBase([{ amount: 2_000_000, agent_commission: 0 }]),
    2_000_000,
  );
});

test("минус на одном занятии не съедает соседние чеки", () => {
  // Комиссия больше чека бывает, когда сумму правили руками. Такое занятие
  // даёт ноль, а не отрицательную базу, иначе оно урезало бы чужие доли.
  assert.equal(
    netSessionsBase([
      { amount: 100_000, agent_commission: 300_000 },
      { amount: 2_000_000, agent_commission: 0 },
    ]),
    2_000_000,
  );
});

test("списание минут с абонемента в базу не идёт", () => {
  assert.equal(netSessionsBase([{ amount: null, agent_commission: null }]), 0);
});
