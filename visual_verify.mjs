import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
const OUT = "/home/devmat/BC4/audit/visual-20261030T2320Z";
import { mkdirSync } from "node:fs"; mkdirSync(OUT, { recursive: true });
const PW = readFileSync("/home/devmat/BC4/.secrets/admin_pw", "utf8").trim();
const BASE = "http://185.248.33.125:5174";

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  const reqs = [];
  page.on("response", (r) => { const u = r.url(); if (/\/sites\?/.test(u)) reqs.push({ url: u.replace(BASE,""), status: r.status() }); });
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[name="username"]');
  await page.fill('input[name="username"]', "admin@bc4.local");
  await page.fill('input[name="password"]', PW);
  await page.locator('form button:has-text("Se connecter")').click();
  await page.waitForURL(/\/(projects|kpi|signaling|map)/, { timeout: 20000 });
  await page.evaluate(() => localStorage.setItem('bc4.activeProject.v1.admin@bc4.local', JSON.stringify({ id: "43e81a34a073", name: "Test_6" })));
  // Clear SitesLayer state localStorage so DEFAULT_STATE (cellsEnabled:true) applies
  await page.evaluate(() => {
    const keys = [];
    for (let i=0; i<localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && /sites.*layer|map.*layer/i.test(k)) keys.push(k);
    }
    keys.forEach(k => localStorage.removeItem(k));
  });
  // Reload at /map
  await page.goto(`${BASE}/map?capture=ecffb18dbd7f`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  const sitesCalls = reqs.filter(r => /\/sites/.test(r.url));
  const zoomCalls = sitesCalls.map(r => (r.url.match(/zoom=(\d+)/)||[])[1]).filter(Boolean);
  await page.screenshot({ path: `${OUT}/map-ecff-default-zoom.png`, fullPage: false });
  const body = await page.locator('body').innerText().catch(()=>"");
  const zoomMsg = /Zoomez pour voir|Zoom in to see/i.test(body);
  console.log(JSON.stringify({
    front_image: await page.evaluate(() => document.querySelector('meta[name="generator"]')?.content || "none"),
    sites_calls: sitesCalls.length,
    sites_zoom_values: zoomCalls,
    first_calls: sitesCalls.slice(0,5),
    zoom_message_visible: zoomMsg,
    body_sample: body.slice(0,300),
  }, null, 2));
  await ctx.close();
  await browser.close();
})();
