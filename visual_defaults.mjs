import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
const OUT = "/home/devmat/BC4/audit/visual-20261031T0010Z";
const PW = readFileSync("/home/devmat/BC4/.secrets/admin_pw", "utf8").trim();
const BASE = "http://185.248.33.125:5174";

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[name="username"]', { timeout: 20000 });
  await page.fill('input[name="username"]', "admin@bc4.local");
  await page.fill('input[name="password"]', PW);
  await page.locator('form button:has-text("Se connecter")').click();
  await page.waitForURL(/\/(projects|change-password|kpi|map|signaling)/, { timeout: 20000 });
  await page.evaluate(() => localStorage.setItem('bc4.activeProject.v1.admin@bc4.local', JSON.stringify({ id: "43e81a34a073", name: "Test_6" })));
  // Clear sites-layer prefs to re-apply defaults
  await page.evaluate(() => {
    for (let i=0; i<localStorage.length; i++) {
      const k = localStorage.key(i); if (k && /sites.*layer|map/i.test(k)) localStorage.removeItem(k);
    }
  });
}

async function probe(browser, viewport, path, label, cap) {
  const b = { requests: [], console: [] };
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on("response", r => { const u=r.url(); if (/\/sites\?|\/metrics\/map/.test(u)) b.requests.push({url: u.replace(BASE,""), status: r.status()}); });
  page.on("console", m => { if (m.type()==="error") b.console.push(m.text().slice(0,200)); });
  await login(page);
  await page.goto(`${BASE}/${path}?capture=${cap}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".maplibregl-canvas, canvas, [data-testid*=timeline]", { timeout: 20000 }).catch(()=>{});
  await page.waitForTimeout(5000);
  // Detect "Centrer sur le parcours" button
  const bodyText = await page.locator('body').innerText().catch(()=>"");
  const centerBtn = /Centrer sur le parcours|Center on route/i.test(bodyText);
  const sitesCalls = b.requests.filter(r => /\/sites/.test(r.url));
  const zoomVals = sitesCalls.map(r => (r.url.match(/zoom=(\d+)/)||[])[1]).filter(Boolean);
  await page.screenshot({ path: `${OUT}/${label}-${cap}-${viewport.width}.png` });
  await ctx.close();
  return { sites_calls: sitesCalls.length, zoom_values: zoomVals, centerBtn, errors: b.console.length };
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const out = {};
  for (const vw of [{width:1440,height:900}, {width:1920,height:1080}]) {
    for (const [p,label] of [["map","map"],["signaling","signaling"],["kpi","kpi"]]) {
      for (const cap of ["ecffb18dbd7f", "a4b0c321c52e"]) {
        const k = `${label}-${cap}-w${vw.width}`;
        try { out[k] = await probe(browser, vw, p, label, cap); } catch(e) { out[k] = { error: e.message }; }
      }
    }
  }
  await browser.close();
  writeFileSync(`${OUT}/results.json`, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
})();
