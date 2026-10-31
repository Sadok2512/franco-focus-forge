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
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1400 } });
  const page = await ctx.newPage();
  const api = [];
  page.on("response", async r => {
    if (/\/reference\/cell/.test(r.url())) {
      api.push({ url: r.url(), status: r.status(), ms: Date.now() });
    }
  });
  await login(page);
  await page.goto(`${BASE}/settings/cellular-reference`, { waitUntil: "networkidle", timeout: 30000 }).catch(e=>console.log("goto err:", e.message));
  await page.waitForTimeout(8000);
  await page.screenshot({ path: `${OUT}/panel-final-state2.png`, fullPage: true });
  const bodyText = await page.locator("body").innerText().catch(()=>"");
  await browser.close();
  const histIdx = bodyText.indexOf("Historique des imports");
  const snip = histIdx >= 0 ? bodyText.slice(histIdx, histIdx+2500) : bodyText.slice(0, 2500);
  console.log("API_CALLS:", JSON.stringify(api, null, 2));
  console.log("\nUI_HISTORY_SECTION:\n", snip);
})();
