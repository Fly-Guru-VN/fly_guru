import { expect, test } from "@playwright/test";

// Языки сайта. Проверяем ровно то, на чём проект уже обжигался и что легко
// сломать молча: цикл редиректов на главной, потерю чистых русских адресов и
// защиту кабинетов под языковым префиксом.

test("русский браузер остаётся на чистом адресе, без редиректа", async ({
  request,
}) => {
  const response = await request.get("/", {
    headers: { "Accept-Language": "ru-RU,ru;q=0.9" },
    maxRedirects: 0,
  });

  expect(response.status()).toBe(200);
});

test("немецкий браузер уезжает на /de при первом заходе", async ({ request }) => {
  const response = await request.get("/", {
    headers: { "Accept-Language": "de-DE,de;q=0.9" },
    maxRedirects: 0,
  });

  expect(response.status()).toBe(307);
  expect(response.headers().location).toBe("/de");
});

test("корейский браузер попадает на корейскую страницу обучения", async ({
  request,
}) => {
  const response = await request.get("/training", {
    headers: { "Accept-Language": "ko-KR,ko;q=0.9" },
    maxRedirects: 0,
  });

  expect(response.status()).toBe(307);
  expect(response.headers().location).toBe("/ko/training");
});

test("выбранный язык в куке бьёт язык браузера", async ({ request }) => {
  const response = await request.get("/", {
    headers: {
      "Accept-Language": "de-DE,de;q=0.9",
      Cookie: "NEXT_LOCALE=ru",
    },
    maxRedirects: 0,
  });

  expect(response.status()).toBe(200);
});

test("робот без Accept-Language получает русскую версию", async ({ request }) => {
  const response = await request.get("/", { maxRedirects: 0 });

  expect(response.status()).toBe(200);
});

test("/ru/training канонизируется в чистый /training", async ({ request }) => {
  const response = await request.get("/ru/training", { maxRedirects: 0 });

  expect(response.status()).toBe(307);
  expect(response.headers().location).toBe("/training");
});

// Именно на этом проект уже стоял: / → /ru → / бесконечно. Язык браузера
// задаём явно: у самого Playwright он английский, и без этого проверка ловила
// бы не цикл, а обычное автоопределение.
test.describe("на главной нет цикла редиректов", () => {
  test.use({ locale: "ru-RU" });

  test("русский гость остаётся на /", async ({ page }) => {
    const response = await page.goto("/", { waitUntil: "domcontentloaded" });

    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe("/");
  });
});

test.describe("автоопределение доводит гостя до его языка", () => {
  test.use({ locale: "de-DE" });

  test("немецкий гость доезжает до /de без цикла", async ({ page }) => {
    const response = await page.goto("/", { waitUntil: "domcontentloaded" });

    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe("/de");
  });
});

test("страница на другом языке открывается и объявляет свой язык", async ({
  page,
}) => {
  const response = await page.goto("/de/training", {
    waitUntil: "domcontentloaded",
  });

  expect(response?.status()).toBeLessThan(400);
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
});

test("кабинет закрыт и под языковым префиксом", async ({ request }) => {
  const response = await request.get("/de/admin", { maxRedirects: 0 });

  expect(response.status()).toBe(307);
  expect(response.headers().location).toContain("/login");
});

test("защитные заголовки стоят и на языковых адресах", async ({ request }) => {
  const response = await request.get("/de/training");

  expect(response.status()).toBeLessThan(400);
  expect(response.headers()["content-security-policy"]).toContain(
    "frame-ancestors 'none'",
  );
});

test("планетка переключает язык и сохраняет раздел", async ({ page }) => {
  await page.goto("/training", { waitUntil: "domcontentloaded" });

  const german = page
    .getByRole("menu", { name: "Язык сайта" })
    .first()
    .getByRole("menuitem", { name: "Deutsch" });

  // Нажатие повторяем, пока список не раскроется: на холодном dev-сервере
  // первый клик иногда приходится на ещё не ожившую (не гидрированную) шапку —
  // кнопка на экране есть, обработчика у неё пока нет.
  await expect(async () => {
    await page.getByRole("button", { name: "Язык сайта" }).first().click();
    await expect(german).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });

  await german.click();

  await expect(page).toHaveURL(/\/de\/training$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
});

test("страница называет поисковику все свои переводы (hreflang)", async ({
  page,
}) => {
  await page.goto("/training", { waitUntil: "domcontentloaded" });

  const links = page.locator('link[rel="alternate"][hreflang]');
  // Семь языков плюс x-default для всех остальных.
  await expect(links).toHaveCount(8);
  await expect(
    page.locator('link[rel="alternate"][hreflang="ko"]'),
  ).toHaveAttribute("href", /\/ko\/training$/);
  await expect(
    page.locator('link[rel="alternate"][hreflang="x-default"]'),
  ).toHaveAttribute("href", /\/training$/);
});
