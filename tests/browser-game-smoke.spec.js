import { test, expect, devices } from "@playwright/test";

const BASE = process.env.BASE_URL || "https://discord-community-platform-production-9348.up.railway.app";
const GAMES = [
  "CODENAMES","SPYFALL","PICTIONARY","CHARADES","WHOAMI","TABOO",
  "WORD_BOMB","TRUTH_LIE","EMOJI_GUESS","TRIVIA","CATEGORIES","LIAR",
  "HOT_SEAT","WOULD_YOU_RATHER","DRAW_GUESS","FASTEST","RIDDLE_RUSH",
  "SECRET_WORD","MIMIC","GUESS_PLAYER","UNO","LUDO","BALOOT","DAQSH",
  "QAWSAR","JAKAROO"
];

test.describe.configure({ mode: "parallel" });

test("every game opens a real multiplayer room", async ({ page, request }) => {
  test.setTimeout(120000);
  const pageErrors = [];
  page.on("pageerror", err => pageErrors.push(err.message));
  await page.goto(BASE + "/#games", { waitUntil: "domcontentloaded" });
  await expect(page.locator("body")).toBeVisible();

  await expect.poll(async () => await page.evaluate(() => typeof window.openEnhancedGameSession)).toBe("function");
  expect(pageErrors, "game room JavaScript errors before session").toEqual([]);

  for (const game of GAMES) {
    const guestId = "pw_" + game.toLowerCase() + "_" + Date.now();
    const created = await request.post(BASE + "/api/games", {
      data: { game, maxPlayers: game === "CODENAMES" ? 8 : 4, guestId, guestName: "اختبار" }
    });
    expect(created.ok(), game + " create").toBeTruthy();
    const createdJson = await created.json();
    const id = createdJson.game.id;

    await page.goto(BASE + "/#games", { waitUntil: "domcontentloaded" });
    await page.evaluate((guestId) => localStorage.setItem("mld_guest_id", guestId), guestId);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect.poll(async () => await page.evaluate(() => typeof window.openEnhancedGameSession)).toBe("function");
    await page.evaluate((id) => window.openEnhancedGameSession(id, false), id);
    expect(pageErrors, game + " browser JavaScript errors").toEqual([]);
    await expect(page.locator(".game-room")).toBeVisible({ timeout: 10000 });
    const mySeat = page.locator(".game-seat-choice").first();
    await expect(mySeat).toBeEnabled();
    await mySeat.click();
    await expect(mySeat).toHaveClass(/selected/);
    await expect(page.locator(".game-perspective-banner")).toContainText(/قائد|عميل|مقعد|أنت/);
    const start = page.locator("#eg-start");
    await expect(start).toBeVisible();
    await expect(start).toBeEnabled();
    await start.click();
    await expect(page.locator(".game-live-pill")).toHaveText("LIVE");
    await expect(page.locator(".game-table").first(), game+" game-table missing. room="+await page.locator(".game-room").innerText()).toBeVisible();
    await expect(page.locator("#eg-fullscreen")).toBeVisible();
    await expect(page.locator("#eg-fullscreen-fab")).toHaveCount(1);
    await expect(page.locator("#eg-leave")).toBeVisible();

    const surface = page.locator(".physical-table");
    await expect(surface).toBeVisible();

    if (["UNO","BALOOT","JAKAROO","QAWSAR"].includes(game)) {
      await expect(page.locator(".table-own-hand, .jackaroo-hand, .qawsar-own-hand").first()).toBeVisible();
    }
    if (game === "LUDO") await expect(page.locator(".ludo-physical")).toBeVisible();
    if (game === "CODENAMES") await expect(page.locator(".codenames-physical")).toBeVisible();

    const finished = await request.post(BASE + "/api/games/" + id + "/finish", {
      data: { guestId }
    });
    expect(finished.ok(), game + " cleanup").toBeTruthy();
  }
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
    test("responsive game room shell", async ({ page }) => {
      await page.goto(BASE + "/#games", { waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).toBeVisible();
      await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
    });
  });
}
