import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { LOCALES } from "@/i18n/locales";
import { LEGACY_SECTIONS, legacyRedirect } from "@/lib/legacyRedirects";

// Редиректы старого сайта. Запуск: npm test
//
// Адреса в примерах — настоящие, из выгрузки 404 Search Console (сентябрь 2026).

test("старые адреса ведут на страницу по смыслу и на тот же язык", () => {
  const cases: [string, string][] = [
    // английский старого сайта жил без префикса → у нас /en
    ["/articles/how-to-choose-an-efoil-board", "/en/shop"],
    ["/boards/hobbywing-s1-charger", "/en/shop"],
    ["/locations/nha-trang-marina", "/en"],
    // русский старого сайта с префиксом → у нас без префикса
    ["/ru/articles/how-to-choose-an-efoil-board", "/shop"],
    ["/ru/locations/nha-trang-marina/services/tandem-flight", "/tandem"],
    ["/ru/locations/nha-trang-marina", "/"],
    ["/ko/locations/nha-trang-marina/articles/what-is-efoil-and-how-it-works", "/ko"],
    ["/vi/articles/efoil-training-safety", "/vi/training"],
    ["/zh/locations/nha-trang-marina/services/efoil-membership-300", "/zh/club"],
    ["/zh/locations/nha-trang-marina/faq", "/zh"],
    ["/ru/blog/photo-album-after-efoil-session", "/reviews"],
    ["/ru/blog/vakansiia-efoil-instruktora-v-niacange", "/"],
    ["/ko/boards/checkout", "/ko/shop"],
    ["/offer", "/en"],
    ["/ru/franchise", "/"],
    // неизвестный адрес внутри старого раздела — по разделу
    ["/articles/some-future-article", "/en"],
    ["/ru/services/unknown", "/prices"],
    // французского у нас нет
    ["/fr", "/en"],
    ["/fr/articles/efoil-basics", "/en"],
  ];
  for (const [from, to] of cases) {
    assert.equal(legacyRedirect(from), to, from);
  }
});

test("Сочи и живые адреса нового сайта не трогаем", () => {
  for (const p of [
    "/locations/sochi",
    "/ru/locations/sochi/services/tandem-flight",
    "/ko/locations/sochi/articles/efoil-basics",
    "/",
    "/ru",
    "/ko",
    "/training",
    "/de/tandem",
    "/shop/lift5",
    "/fr/training",
    "/admin/bookings",
  ]) {
    assert.equal(legacyRedirect(p), null, p);
  }
});

test("старые разделы не совпадают с нынешними страницами и языками", () => {
  const appDir = path.join(process.cwd(), "src/app/[locale]");
  const current = new Set([
    ...fs.readdirSync(appDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name),
    ...LOCALES,
  ]);
  for (const section of LEGACY_SECTIONS) {
    assert.ok(!current.has(section), `раздел /${section} есть на новом сайте`);
  }
});
