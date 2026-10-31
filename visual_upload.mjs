import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";

const OUT = "/home/devmat/BC4/audit/upload-20261031T0107Z";
const PW = readFileSync("/home/devmat/BC4/.secrets/admin_pw", "utf8").trim();
const BASE = "http://185.248.33.125:5174";

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[name="username"]', { timeout: 20000 });
  await page.fill('input[name="username"]', "admin@bc4.local");
  await page.fill('input[name="password"]', PW);
  await page.locator('form button:has-text("Se connecter")').click();
  await page.waitForURL(/\/(projects|change-password|kpi|map|signaling|settings)/, { timeout: 20000 });
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  const errs = [];
  const apiLog = [];
  page.on("console", m => { if (m.type()==="error") errs.push(m.text().slice(0,200)); });
  page.on("response", r => {
    const u = r.url();
    if (/\/reference\/cell|\/settings\/cell-ref/.test(u)) {
      apiLog.push({ url: u.replace(BASE,""), status: r.status(), method: r.request().method() });
    }
  });
  await login(page);
  // Try common settings routes
  for (const route of ["/settings/cellular-reference", "/settings/cell-ref", "/settings/references", "/settings", "/admin/settings"]) {
    await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" }).catch(()=>{});
    await page.waitForTimeout(3000);
    const t = (await page.locator("body").innerText().catch(()=>"")).slice(0, 1200);
    if (/référentiel|reference|cell-ref|Cellular/i.test(t)) {
      await page.screenshot({ path: `${OUT}/settings-${route.replace(/\//g,"_")}.png` });
      break;
    }
  }
  const bodyText = await page.locator("body").innerText().catch(()=>"");
  await page.screenshot({ path: `${OUT}/settings-final.png` });
  writeFileSync(`${OUT}/preflight.json`, JSON.stringify({ apiLog, errs: errs.slice(0,10), bodyPreview: bodyText.slice(0, 1500) }, null, 2));
  await browser.close();
  console.log(JSON.stringify({ apiLog, errCount: errs.length, firstErrs: errs.slice(0, 3), bodyPreview: bodyText.slice(0, 600) }, null, 2));
})();
