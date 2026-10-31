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
  let api = { tables: [], lastTable: null };
  page.on("console", m => { if (m.type()==="error") errs.push(m.text().slice(0,200)); });
  page.on("response", async r => {
    const u = r.url();
    if (/\/metrics\/table\?/.test(u) && r.status()===200) {
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

  // Find a point with probable serving (confidence probable + probable_serving_cell_id)
  const mp = api.lastTable?.map_points ?? [];
  // Prefer: point with probable confidence and some serving link
  const withServing = mp.filter(p => p.lat && p.lng && (p.serving_cell_ref_id || p.probable_serving_cell_id));
  const withProbable = mp.filter(p => p.lat && p.lng && p.confidence === "probable");
  const sample = {
    total: mp.length,
    withServing: withServing.length,
    withProbable: withProbable.length,
    firstServing: withServing[0] ? {
      seq: withServing[0].seq, lat: withServing[0].lat, lng: withServing[0].lng,
      serving_cell_ref_id: withServing[0].serving_cell_ref_id,
      probable_serving_cell_id: withServing[0].probable_serving_cell_id,
      link_method: withServing[0].link_method,
      confidence: withServing[0].confidence,
      neighbour_links: (withServing[0].neighbour_links||[]).length,
      nr_anchor_link: !!withServing[0].nr_anchor_link,
    } : null,
    firstProbable: withProbable[0] ? {
      seq: withProbable[0].seq, lat: withProbable[0].lat, lng: withProbable[0].lng,
      serving_cell_ref_id: withProbable[0].serving_cell_ref_id,
      probable_serving_cell_id: withProbable[0].probable_serving_cell_id,
      link_method: withProbable[0].link_method,
      confidence: withProbable[0].confidence,
      probable_serving_cell_lat: withProbable[0].probable_serving_cell_lat,
      probable_serving_cell_lng: withProbable[0].probable_serving_cell_lng,
      neighbour_links: (withProbable[0].neighbour_links||[]).length,
    } : null,
  };

  // Click on probable sample point
  const target = withProbable[0] ?? withServing[0] ?? mp[0];
  // Compute pixel: fly map to target then click center
  let click = { ok: false, reason: "no-target" };
  if (target) {
    // Click center of the map (which was auto-framed on parcours)
    const canvas = await page.locator(".maplibregl-canvas").first();
    const box = await canvas.boundingBox();
    if (box) {
      const cx = box.x + box.width/2, cy = box.y + box.height/2;
      const tries = [];
      // Dense full-screen scan this time
      for (let r = 0; r <= 450; r += 2) {
        for (let a = 0; a < 360; a += 8) {
          tries.push([cx + r*Math.cos(a*Math.PI/180), cy + r*Math.sin(a*Math.PI/180)]);
        }
      }
      let seen = {}; const uniqueTries = [];
      for (const [x,y] of tries) {
        const k = `${Math.round(x)}:${Math.round(y)}`;
        if (!seen[k]) { seen[k]=1; uniqueTries.push([x,y]); }
      }
      for (let i = 0; i < Math.min(uniqueTries.length, 2500); i++) {
        const [px, py] = uniqueTries[i];
        await page.mouse.click(px, py);
        const popup = page.locator(".measurement-point-popup").first();
        if (await popup.isVisible().catch(()=>false)) {
          const text = await popup.innerText().catch(()=>"");
          if (/Serving cell|Neighbour|Voisin/.test(text) && (text.includes("PROBABLE") || text.includes("probable"))) {
            click = { ok: true, text: text.slice(0,900), at: [Math.round(px-box.x), Math.round(py-box.y)], tried: i+1, kind: "probable" };
            break;
          }
          if (!click.ok && /Serving cell/.test(text)) {
            click = { ok: true, text: text.slice(0,900), at: [Math.round(px-box.x), Math.round(py-box.y)], tried: i+1, kind: "with-serving" };
            // keep searching for probable one
          }
          if (!click.ok && text.length > 30) {
            click = { ok: true, text: text.slice(0,900), at: [Math.round(px-box.x), Math.round(py-box.y)], tried: i+1, kind: "partial" };
          }
        }
      }
    }
  }
  if (click.ok) await page.screenshot({ path: `${OUT}/map-a4b0c321c52e-popup-serving.png`, fullPage: false });
  await browser.close();
  writeFileSync(`${OUT}/results6.json`, JSON.stringify({ sample, click, errs: errs.slice(0,5) }, null, 2));
  console.log(JSON.stringify({ sample, click, errs: errs.slice(0,5) }, null, 2));
})();
