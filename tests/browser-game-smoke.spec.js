import { test, expect, devices } from "@playwright/test";

const BASE = process.env.BASE_URL || "https://discord-community-platform-production-9348.up.railway.app";
const GAMES = [
  "CODENAMES","SPYFALL","PICTIONARY","CHARADES","WHOAMI","TABOO",
  "WORD_BOMB","TRUTH_LIE","EMOJI_GUESS","TRIVIA","CATEGORIES","LIAR",
  "HOT_SEAT","WOULD_YOU_RATHER","DRAW_GUESS","FASTEST","RIDDLE_RUSH",
  "SECRET_WORD","MIMIC","GUESS_PLAYER","UNO","LUDO","BALOOT","DAQSH",
  "QAWSAR","JAKAROO"
];

test.describe.configure({ mode: "serial" });

test("every game opens a real multiplayer room", async ({ page, request }) => {
  await page.goto(BASE + "/#games", { waitUntil: "domcontentloaded" });
  await expect(page.locator("body")).toBeVisible();

  for (const game of GAMES) {
    const guestId = "pw_" + game.toLowerCase() + "_" + Date.now();
    const created = await request.post(BASE + "/api/games", {
      data: { game, maxPlayers: game === "CODENAMES" ? 8 : 4, guestId, guestName: "اختبار" }
    });
    expect(created.ok(), game + " create").toBeTruthy();
    const createdJson = await created.json();
    const id = createdJson.game.id;

    const seat = await request.post(BASE + "/api/games/" + id + "/seat", {
      data: { guestId, seat: "0" }
    });
    expect(seat.ok(), game + " seat").toBeTruthy();

    const started = await request.post(BASE + "/api/games/" + id + "/start", {
      data: { guestId }
    });
    expect(started.ok(), game + " start").toBeTruthy();

    await page.goto(BASE + "/#games", { waitUntil: "domcontentloaded" });
    await page.evaluate((id) => window.openEnhancedGameSession(id, false), id);
    await expect(page.locator(".game-room")).toBeVisible({ timeout: 10000 });
    await expect(page.locator(".game-table")).toBeVisible();
    await expect(page.locator("#eg-fullscreen")).toBeVisible();
    await expect(page.locator("#eg-fullscreen-fab")).toBeVisible();
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
    test.use(project.use);
    test("responsive game room shell", async ({ page }) => {
      await page.goto(BASE + "/#games", { waitUntil: "domcontentloaded" });
      await expect(page.locator("body")).toBeVisible();
      await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
    });
  });
}
