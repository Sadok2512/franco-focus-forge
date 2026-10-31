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
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1200 } });
  const page = await ctx.newPage();
  await login(page);
  await page.goto(`${BASE}/settings/cellular-reference`, { waitUntil: "domcontentloaded" });
  await page.waitForResponse(r => /\/reference\/cell\/imports/.test(r.url()) && r.status()===200, { timeout: 30000 }).catch(()=>null);
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${OUT}/panel-final-state.png`, fullPage: true });
  const bodyText = await page.locator("body").innerText().catch(()=>"");
  await browser.close();
  // Snippet of history section
  const histIdx = bodyText.indexOf("Historique des imports");
  const snip = histIdx >= 0 ? bodyText.slice(histIdx, histIdx+1500) : bodyText.slice(0, 1500);
  console.log(snip);
})();
