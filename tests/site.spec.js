import { test, expect } from "@playwright/test";
const BASE=process.env.BASE_URL||"https://discord-community-platform-production-9348.up.railway.app";
const routes=["members","top","roles","chat","private-chat","profile","message","games","groups","account","tickets","apply","reviews"];
test.describe("MLD public UI",()=>{
  test("homepage loads without console errors",async({page})=>{const errors=[];page.on("pageerror",e=>errors.push(e.message));await page.goto(BASE,{waitUntil:"networkidle"});await expect(page.locator("#top")).toBeVisible();expect(errors).toEqual([]);});
  for(const route of routes){test("route "+route+" renders",async({page})=>{const errors=[];page.on("pageerror",e=>errors.push(e.message));await page.goto(BASE,{waitUntil:"domcontentloaded"});await page.locator('[data-view="'+route+'"]').first().click();await expect(page.locator("#view-title")).not.toHaveText("الصفحة الرئيسية",{timeout:5000});await expect(page.locator("#status")).not.toHaveText("تعذر فتح القائمة حاليًا");expect(errors).toEqual([]);});}
  test("games lobby is real and interactive",async({page})=>{await page.goto(BASE,{waitUntil:"networkidle"});await page.locator('[data-view="games"]').first().click();await expect(page.locator("#game-create")).toBeVisible();await expect(page.locator("#game-lobbies")).toBeVisible();await page.locator("#game-kind").selectOption("TRIVIA");await page.locator("#game-max").fill("2");});
  test("mobile menu rebuilds and routes",async({page})=>{await page.setViewportSize({width:390,height:844});await page.goto(BASE,{waitUntil:"networkidle"});await page.locator("#menu").click();await expect(page.locator("#mobile-menu")).toHaveClass(/open/);await page.locator('#mobile-menu [data-view="games"]').click();await expect(page.locator("#game-create")).toBeVisible();});
});
test.describe("MLD public API",()=>{test("health endpoint is healthy",async({request})=>{const r=await request.get(BASE+"/health");expect(r.status()).toBe(200);expect((await r.json()).ok).toBe(true);});for(const path of ["/api/public/server","/api/public/roles","/api/public/members","/api/public/top","/api/games","/api/site/stats","/api/site/settings","/api/reviews"]){test(path+" returns JSON",async({request})=>{const r=await request.get(BASE+path);expect(r.status()).toBeLessThan(500);expect(r.headers()["content-type"]||"").toContain("application/json");});}});

test("mobile menu opens, navigates, and closes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + "?v=fix22", { waitUntil: "networkidle", timeout: 30000 });
  const menu = page.locator("#menu");
  await expect(menu).toBeVisible();
  await menu.click();
  await expect(page.locator("#mobile-menu")).toHaveClass(/open/);
  await page.locator('#mobile-menu [data-view="members"]').click();
  await expect(page.locator("#mobile-menu")).not.toHaveClass(/open/);
  await expect(page.locator("#view-title")).toContainText("الأعضاء");
});

test("four-player card lobby isolates each player's hand", async ({ request }) => {
  const ids = Array.from({length:4},(_,i)=>"e2e_"+Date.now()+"_"+i+"_"+Math.random().toString(36).slice(2,8));
  const payload=i=>({guestId:ids[i],guestName:"E2E"+(i+1)});
  const created=await request.post(BASE+"/api/games",{data:{game:"BALOOT",maxPlayers:4,...payload(0)}});
  expect(created.ok()).toBeTruthy();
  const lobby=(await created.json()).game;
  const id=lobby.id;
  for(let i=1;i<4;i++){
    const r=await request.post(BASE+"/api/games/"+id+"/join",{data:payload(i)});
    expect(r.ok()).toBeTruthy();
  }
  const seats=["فريق A - 1","فريق A - 2","فريق B - 1","فريق B - 2"];
  for(let i=0;i<4;i++){
    const r=await request.post(BASE+"/api/games/"+id+"/seat",{data:{...payload(i),seat:seats[i]}});
    expect(r.ok()).toBeTruthy();
  }
  const started=await request.post(BASE+"/api/games/"+id+"/start",{data:payload(0)});
  expect(started.ok()).toBeTruthy();
  const states=[];
  for(let i=0;i<4;i++){
    const r=await request.get(BASE+"/api/games/"+id+"/state?guestId="+encodeURIComponent(ids[i]));
    expect(r.ok()).toBeTruthy();
    states.push((await r.json()).state);
  }
  for(const s of states){
    expect(s.hand).toBeTruthy();
    expect(s.hand.length).toBe(8);
    expect(s.hands).toBeUndefined();
    expect(s.playerSecrets).toBeUndefined();
  }
  const firstIds=states[0].hand.map(c=>c.id);
  const secondIds=states[1].hand.map(c=>c.id);
  expect(firstIds.some(x=>secondIds.includes(x))).toBeFalsy();
  const spectator=await request.get(BASE+"/api/games/"+id+"/watch");
  expect(spectator.ok()).toBeTruthy();
  const finished=await request.post(BASE+"/api/games/"+id+"/finish",{data:payload(0)});
  expect(finished.ok()).toBeTruthy();
});
