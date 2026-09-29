import { test, expect, devices } from "@playwright/test";

const BASE = process.env.BASE_URL || "https://discord-community-platform-production-9348.up.railway.app";

test.describe.configure({ mode: "serial" });

test("games hub opens and exposes the live room shell", async ({ page, request }) => {
  test.setTimeout(120000);
  const pageErrors = [];
  page.on("pageerror", err => pageErrors.push(err.message));

  await page.goto(BASE + "/#games", { waitUntil: "domcontentloaded" });
  await expect(page.locator("body")).toBeVisible();
  await expect(page.locator(".games-create-card")).toBeVisible({ timeout: 15000 });
  await expect(page.locator("#game-select")).toBeVisible();
  await expect(page.locator("#game-create")).toBeEnabled();

  const catalog = await request.get(BASE + "/api/games/sessions");
  expect(catalog.ok(), "game sessions API").toBeTruthy();
  const data = await catalog.json();
  expect(Array.isArray(data.sessions)).toBeTruthy();

  const gameNames = await page.locator("#game-select option").allTextContents();
  expect(gameNames.length).toBeGreaterThan(2);
  expect(gameNames.join(" ")).toMatch(/UNO|مونوبولي|لودو/i);

  expect(pageErrors, "game hub JavaScript errors").toEqual([]);
});

for (const project of [
  { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
  { name: "firefox-desktop", use: { ...devices["Desktop Firefox"] } },
  { name: "webkit-desktop", use: { ...devices["Desktop Safari"] } },
  { name: "iphone-safari", use: { ...devices["iPhone 13"] } },
  { name: "pixel-chrome", use: { ...devices["Pixel 5"] } }
]) {
  test.describe(project.name, () => {
    const { defaultBrowserType, ...use } = project.use;
    test.use(use);
    test("responsive games hub", async ({ page }) => {
      await page.goto(BASE + "/#games", { waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).toBeVisible();
      await expect(page.locator(".games-create-card")).toBeVisible({ timeout: 15000 });
      await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
    });
  });
}
