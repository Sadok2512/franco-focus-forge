import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";

const OUT = "/home/devmat/BC4/audit/neighbours-20261031T0745Z";
const PW = readFileSync("/home/devmat/BC4/.secrets/admin_pw", "utf8").trim();
const BASE = "http://185.248.33.125:5174";
const PROJECT = "43e81a34a073";

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[name="username"]', { timeout: 20000 });
  await page.fill('input[name="username"]', "admin@bc4.local");
  await page.fill('input[name="password"]', PW);
  await page.locator('form button:has-text("Se connecter")').click();
  await page.waitForURL(/\/(projects|change-password|kpi|map|signaling|settings)/, { timeout: 20000 });
}

async function probe(browser, cap) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  await login(page);
  await page.evaluate(({ pid, cid }) => {
    for (let i = localStorage.length-1; i>=0; i--) {
      const k = localStorage.key(i);
      if (k && /capture|project|drive|map|sites/i.test(k)) localStorage.removeItem(k);
    }
    localStorage.setItem('bc4.activeProject.v1.admin@bc4.local', JSON.stringify({ id: pid, name: "Test_6" }));
    localStorage.setItem(`bc4.activeCapture.${pid}`, cid);
    localStorage.setItem(`bc4.driveRsrp.lastCapture.${pid}`, cid);
  }, { pid: PROJECT, cid: cap });
  await page.goto(`${BASE}/map?capture=${cap}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".maplibregl-canvas", { timeout: 30000 });
  await page.waitForResponse(r => /\/metrics\/table\?/.test(r.url()) && r.status()===200, { timeout: 90000 }).catch(()=>null);
  await page.waitForTimeout(6000);
  const driveRsrpButton = page.locator('button:has-text("Drive RSRP")').first();
  if (await driveRsrpButton.isVisible().catch(()=>false)) {
    try { await driveRsrpButton.click({ timeout: 2000 }); } catch(_) {}
    await page.waitForTimeout(800);
  }
  await page.screenshot({ path: `${OUT}/map-${cap}-panel.png`, fullPage: false });
  const canvas = await page.locator(".maplibregl-canvas").first();
  const box = await canvas.boundingBox();
  let click = { ok: false };
  if (box) {
    const cx = box.x + box.width/2, cy = box.y + box.height/2;
    for (let r = 10; r <= 300; r += 4) {
      for (let a = 0; a < 360; a += 15) {
        const [px, py] = [cx + r*Math.cos(a*Math.PI/180), cy + r*Math.sin(a*Math.PI/180)];
        await page.mouse.click(px, py);
        const popup = page.locator(".measurement-point-popup").first();
        if (await popup.isVisible().catch(()=>false)) {
          const text = await popup.innerText().catch(()=>"");
          if (/Serving cell|Neighbour|Voisin|NR anchor|ancre NR/i.test(text)) {
            click = { ok: true, text: text.slice(0, 1200), at: [Math.round(px-box.x), Math.round(py-box.y)] };
            await page.screenshot({ path: `${OUT}/map-${cap}-popup.png`, fullPage: false });
            break;
          }
          await page.keyboard.press("Escape");
          await page.waitForTimeout(40);
        }
      }
      if (click.ok) break;
    }
  }
  await ctx.close();
  return { cap, click };
}

(async () => {
  await import("node:fs/promises").then(f => f.mkdir(OUT, { recursive: true }));
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const out = {};
  for (const cap of ["ecffb18dbd7f", "a4b0c321c52e", "daa2b1df250d"]) {
    try { out[cap] = await probe(browser, cap); } catch (e) { out[cap] = { error: e.message }; }
  }
  await browser.close();
  writeFileSync(`${OUT}/results.json`, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
})();
