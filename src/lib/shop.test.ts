import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { SHOP_BRANDS, shopEfoils, shopProducts } from "@/content/shop";
import {
  buildShopInquiryText,
  efoilImages,
  formatUsd,
  priceFrom,
  productCover,
  resolveShopSelection,
} from "@/lib/shop";

// Магазин (этап 1). Запуск: npm test
//
// Главное здесь — сервер не верит тому, что прислала форма: товар, размер и
// цвет сверяются со справочником, а цена в уведомлении берётся из него же.
// Иначе в рабочий чат можно было бы прислать «LIFT5 за $1».

test("каждое фото из справочника лежит на диске", () => {
  const missing: string[] = [];
  const check = (src: string) => {
    if (!fs.existsSync(path.join(process.cwd(), "public", src))) missing.push(src);
  };
  for (const p of shopProducts) {
    if (p.category === "efoil") {
      for (const s of p.sizes) for (const c of p.colors) efoilImages(p, s.id, c.id).forEach(check);
    } else {
      for (const v of p.variants) v.images.forEach(check);
    }
    check(productCover(p));
  }
  assert.deepEqual(missing, []);
});

test("id товаров не повторяются — это адрес страницы", () => {
  const ids = shopProducts.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("размер по умолчанию есть в списке размеров", () => {
  for (const p of shopEfoils) {
    assert.ok(p.sizes.some((s) => s.id === p.defaultSizeId), p.id);
  }
});

// Цену с чужой базой нельзя показывать под подписью «розница Lift в США», и
// наоборот. Бренд — единственное, что их различает, поэтому он обязан быть
// известным: чужая строка тихо увела бы Hobbywing под подпись Lift.
test("бренд товара — один из тех, что знает каталог", () => {
  for (const p of shopProducts) {
    assert.ok(SHOP_BRANDS.includes(p.brand), p.id);
  }
});

test("выбор гостя превращается в понятную строку с ценой из справочника", () => {
  // Бренд в начале строки — не украшение: у Hobbywing доска называется просто
  // «S1», и без бренда в чат прилетало бы «S1 · 160 cm · Blue».
  assert.deepEqual(
    resolveShopSelection({ productId: "lift5", sizeId: "5-4", colorId: "steel-blue" }),
    {
      productId: "lift5",
      brand: "Lift Foils",
      title: "Lift Foils · LIFT5 · 5'4 Cruiser · Steel Blue",
      priceUsd: 14_999,
    },
  );
  assert.deepEqual(resolveShopSelection({ productId: "blowfish", variantId: "4-9" }), {
    productId: "blowfish",
    brand: "Lift Foils",
    title: "Lift Foils · Blowfish · 4'9",
    priceUsd: 599,
  });
  // Вариант у товара один — без подписи варианта в названии.
  assert.equal(
    resolveShopSelection({ productId: "beach-wheels" })?.title,
    "Lift Foils · LIFT5 Beach Wheels",
  );
  assert.deepEqual(resolveShopSelection({ productId: "hobby-s1", colorId: "wood" }), {
    productId: "hobby-s1",
    brand: "Hobbywing",
    title: "Hobbywing · S1 · 160 cm · Wood",
    priceUsd: 6_900,
  });
});

test("пустой размер — берём тот, что показан по умолчанию", () => {
  assert.equal(resolveShopSelection({ productId: "liftx" })?.title, "Lift Foils · LIFTX · 4'8");
});

test("выдуманный товар, размер, цвет или вариант не проходит", () => {
  assert.equal(resolveShopSelection({ productId: "lift9" }), null);
  assert.equal(resolveShopSelection({ productId: "lift5", sizeId: "9-9" }), null);
  // Цвет чужой линейки: Dawn Patrol бывает только у LIFTX.
  assert.equal(resolveShopSelection({ productId: "lift5", colorId: "dawn-patrol" }), null);
  assert.equal(resolveShopSelection({ productId: "blowfish", variantId: "6-0" }), null);
  assert.equal(resolveShopSelection({ productId: null }), null);
});

test("цена «от» — самая низкая среди размеров и вариантов", () => {
  const lift5f = shopProducts.find((p) => p.id === "lift5-f")!;
  assert.equal(priceFrom(lift5f), 10_999);
  assert.equal(formatUsd(14_999), "$14,999");
});

test("уведомление о заявке: товар, цена и контакт гостя", () => {
  const text = buildShopInquiryText({
    item: resolveShopSelection({ productId: "lift5", sizeId: "4-9", colorId: "red-rock" }),
    clientName: "Анна",
    contact: "+84 90 123 45 67",
    messenger: "WhatsApp",
    comment: "Можно в рассрочку?",
    locale: "ko",
  });
  assert.match(text, /Товар: Lift Foils · LIFT5 · 4'9 Sport · Red Rock/);
  assert.match(text, /\$14,999/);
  assert.match(text, /розница Lift в США/);
  assert.match(text, /\+84 90 123 45 67 \(WhatsApp\)/);
  assert.match(text, /Можно в рассрочку\?/);
  assert.match(text, /корейский/);
});

test("у Hobbywing в чат уходит своя приписка к цене: доставка уже внутри", () => {
  const text = buildShopInquiryText({
    item: resolveShopSelection({ productId: "hobby-s1-pack", colorId: "blue" }),
    clientName: "Игорь",
    contact: "0901234567",
  });
  assert.match(text, /Товар: Hobbywing · S1 Pack · 160 cm · Blue/);
  assert.match(text, /\$9,900 \(с доставкой до двери\)/);
});

test("уведомление без товара — это просьба о консультации", () => {
  const text = buildShopInquiryText({
    item: null,
    clientName: "Том",
    contact: "0901234567",
    locale: "ru",
  });
  assert.match(text, /консультация/);
  assert.doesNotMatch(text, /Язык клиента/);
});
