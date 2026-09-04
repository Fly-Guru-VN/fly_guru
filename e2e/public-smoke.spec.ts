import { expect, test } from "@playwright/test";

const publicPages = [
  { path: "/", name: "главная" },
  { path: "/training", name: "обучение" },
  { path: "/tandem", name: "тандем" },
  { path: "/club", name: "клуб" },
  { path: "/prices", name: "цены" },
  { path: "/reviews", name: "отзывы" },
  { path: "/contacts", name: "контакты" },
];

for (const pageInfo of publicPages) {
  test(`${pageInfo.name}: страница открывается`, async ({ page }) => {
    const browserErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(message.text());
    });
    page.on("pageerror", (error) => browserErrors.push(error.message));

    const response = await page.goto(pageInfo.path, {
      waitUntil: "domcontentloaded",
    });

    expect(response, `Нет HTTP-ответа для ${pageInfo.path}`).not.toBeNull();
    expect(response?.status(), `HTTP ${response?.status()} на ${pageInfo.path}`).toBeLessThan(400);
    await expect(page).toHaveTitle(/FlyGuru/i);
    await expect(page.locator("body")).toBeVisible();
    await expect(page.locator("main")).toBeVisible();
    await page.waitForTimeout(100);
    expect(browserErrors, `Ошибки браузера на ${pageInfo.path}`).toEqual([]);
  });
}

test("клиентский переход сохраняет чистый URL и не ломает hydration", async ({
  page,
}) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator('a[href="/training"]:visible').first().click();

  await expect(page).toHaveURL(/\/training$/);
  await expect(page).toHaveTitle(/Обучение.*FlyGuru/i);
  await expect(page.locator("main")).toBeVisible();
  await page.waitForTimeout(100);
  expect(browserErrors, "Ошибки браузера при SPA-переходе").toEqual([]);
});

test("публичные страницы получают защитные заголовки", async ({ request }) => {
  const response = await request.get("/training");

  expect(response.status()).toBeLessThan(400);
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["referrer-policy"]).toBe(
    "strict-origin-when-cross-origin",
  );
  expect(response.headers()["permissions-policy"]).toContain("microphone=()");
  expect(response.headers()["content-security-policy"]).toContain(
    "frame-ancestors 'none'",
  );
});

test("кабинет администратора закрыт, включая поддельный locale-заголовок", async ({
  request,
}) => {
  for (const headers of [undefined, { "x-next-intl-locale": "ru" }]) {
    const response = await request.get("/admin", {
      headers,
      maxRedirects: 0,
    });

    expect(response.status()).toBe(307);
    expect(response.headers().location).toBe("/login?next=%2Fadmin");
  }
});

test("Telegram Mini App сохраняет узкое разрешение iframe", async ({ request }) => {
  const response = await request.get("/member");

  expect(response.status()).toBeLessThan(400);
  expect(response.headers()["content-security-policy"]).toContain(
    "frame-ancestors 'self' https://web.telegram.org",
  );
  expect(response.headers()["x-frame-options"]).toBeUndefined();
});
