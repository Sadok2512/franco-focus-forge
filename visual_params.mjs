import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
const OUT = "/home/devmat/BC4/audit/visual-20261030T2015Z";
const PW = readFileSync("/home/devmat/BC4/.secrets/admin_pw", "utf8").trim();
(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto("http://127.0.0.1:5174/login", { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[name="username"]');
  await page.fill('input[name="username"]', "admin@bc4.local");
  await page.fill('input[name="password"]', PW);
  await page.locator('form button:has-text("Se connecter")').click();
  await page.waitForURL(/\/(projects|kpi)/, { timeout: 15000 });
  await page.evaluate(() => localStorage.setItem('bc4.activeProject.v1.admin@bc4.local', JSON.stringify({ id: "43e81a34a073", name: "Test_6" })));
  await page.goto("http://127.0.0.1:5174/kpi?capture=a4b0c321c52e", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  // Click Parameters tab — use button with text Parameters as first-level nav
  const tabs = await page.locator('button, [role="tab"]').all();
  for (const t of tabs) {
    const txt = (await t.innerText().catch(()=>"")).trim();
    if (txt === "Parameters") { await t.click(); break; }
  }
  await page.waitForTimeout(3000);
  // Expand PHY
  const phy = page.getByText(/^PHY$/i).first();
  if (await phy.count()) await phy.click();
  await page.waitForTimeout(1500);
  // Click first checkbox under PHY
  const firstCheck = page.locator('input[type="checkbox"]').first();
  await firstCheck.click().catch(()=>{});
  await page.waitForTimeout(3500);
  const body = await page.locator('body').innerText().catch(()=>"");
  const paramLabel = body.match(/PHY\s*·\s*\d+\s*paramètres?/i)?.[0] || "<not-found>";
  const columnHeaders = await page.locator('table thead th, [role="columnheader"]').evaluateAll(ns => ns.map(n => n.textContent?.trim()).filter(Boolean));
  const unknownsOk = !/Chargement/i.test(body);
  await page.screenshot({ path: `${OUT}/03b-parameters-phy.png`, fullPage: false });
  writeFileSync(`${OUT}/params_result.json`, JSON.stringify({ paramLabel, columnHeaders, unknownsOk }, null, 2));
  console.log(JSON.stringify({ paramLabel, columnHeaders: columnHeaders.slice(0,20), unknownsOk }, null, 2));
  await ctx.close();
  await browser.close();
})();
