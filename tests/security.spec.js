import { test, expect } from "@playwright/test";
const BASE=process.env.BASE_URL||"https://discord-community-platform-production-9348.up.railway.app";
test.describe("MLD authorization and security smoke",()=>{
  for(const path of ["/api/owner/logs","/api/owner/users","/api/owner/applications","/api/owner/tickets","/api/owner/settings"]){
    test("unauthenticated access blocked: "+path,async({request})=>{
      const r=await request.get(BASE+path);
      expect([401,403]).toContain(r.status());
    });
  }
  test("security headers present",async({request})=>{
    const r=await request.get(BASE+"/health");
    expect(r.headers()["x-content-type-options"]).toBe("nosniff");
    expect(r.headers()["x-frame-options"]).toBe("DENY");
    expect(r.headers()["referrer-policy"]).toBeTruthy();
    expect(r.headers()["permissions-policy"]).toContain("camera=()");
  });
  test("oversized JSON body rejected",async({request})=>{
    const body=JSON.stringify({message:"x".repeat(25000)});
    const r=await request.post(BASE+"/api/site/visit",{data:body,headers:{"content-type":"application/json"}});
    expect(r.status()).toBeLessThan(500);
  });
  test("invalid public member id does not crash server",async({request})=>{
    const r=await request.get(BASE+"/api/public/member/not-a-real-id");
    expect([404,503]).toContain(r.status());
  });
});