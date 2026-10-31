import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";

const OUT = "/home/devmat/BC4/audit/popup-20261031T0045Z";
const PW = readFileSync("/home/devmat/BC4/.secrets/admin_pw", "utf8").trim();
const BASE = "http://185.248.33.125:5174";
const PROJECT = "43e81a34a073";
const CAPTURE = "a4b0c321c52e";

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[name="username"]', { timeout: 20000 });
  await page.fill('input[name="username"]', "admin@bc4.local");
  await page.fill('input[name="password"]', PW);
  await page.locator('form button:has-text("Se connecter")').click();
  await page.waitForURL(/\/(projects|change-password|kpi|map|signaling)/, { timeout: 20000 });
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  const errs = [];
  let api = { lastTable: null };
  page.on("console", m => { if (m.type()==="error") errs.push(m.text().slice(0,200)); });
  page.on("response", async r => {
    if (/\/metrics\/table\?/.test(r.url()) && r.status()===200) {
      try { api.lastTable = await r.json(); } catch (_) {}
    }
  });
  await login(page);
  await page.evaluate(({ pid, cid }) => {
    for (let i = localStorage.length-1; i>=0; i--) {
      const k = localStorage.key(i);
      if (k && /capture|project|drive|map|sites/i.test(k)) localStorage.removeItem(k);
    }
    localStorage.setItem('bc4.activeProject.v1.admin@bc4.local', JSON.stringify({ id: pid, name: "Test_6" }));
    localStorage.setItem(`bc4.activeCapture.${pid}`, cid);
    localStorage.setItem(`bc4.driveRsrp.lastCapture.${pid}`, cid);
  }, { pid: PROJECT, cid: CAPTURE });
  await page.goto(`${BASE}/map?capture=${CAPTURE}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".maplibregl-canvas", { timeout: 30000 });
  await page.waitForResponse(r => /\/metrics\/table\?/.test(r.url()) && r.status()===200, { timeout: 90000 }).catch(()=>null);
  await page.waitForTimeout(5000);

  const seen = [];
  const canvas = await page.locator(".maplibregl-canvas").first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("no canvas box");
  const cx = box.x + box.width/2, cy = box.y + box.height/2;
  // Spiral but skip very close positions (ensure distinct features)
  const tries = [];
  for (let r = 10; r <= 500; r += 6) {
    for (let a = 0; a < 360; a += 18) {
      tries.push([cx + r*Math.cos(a*Math.PI/180), cy + r*Math.sin(a*Math.PI/180)]);
    }
  }
  let bestProbable = null;
  let count = 0;
  for (const [px, py] of tries) {
    await page.mouse.click(px, py);
    await page.waitForTimeout(80);
    const popup = page.locator(".measurement-point-popup").first();
    if (await popup.isVisible().catch(()=>false)) {
      const text = await popup.innerText().catch(()=>"");
      const summary = { at: [Math.round(px-box.x), Math.round(py-box.y)], len: text.length, hasServing: /Serving cell/.test(text), hasProbable: /PROBABLE|Probable|probable/.test(text), hasProven: /PROVEN|Proven|proven/.test(text), textSnip: text.slice(0,250) };
      seen.push(summary);
      if (summary.hasServing && summary.hasProbable && !bestProbable) {
        bestProbable = { ...summary, text: text.slice(0, 900) };
        await page.screenshot({ path: `${OUT}/map-a4b0c321c52e-popup-probable.png`, fullPage: false });
      }
      if (summary.hasServing) count++;
      // Dismiss the popup by clicking at (0,0) outside canvas or press Escape
      await page.keyboard.press("Escape");
      await page.waitForTimeout(40);
      if (bestProbable && count >= 8) break;
    }
  }
  await browser.close();
  const result = { bestProbable, seenCount: seen.length, servingSeenCount: count, firstFive: seen.slice(0, 5), errs: errs.slice(0,5) };
  writeFileSync(`${OUT}/results7.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
})();
