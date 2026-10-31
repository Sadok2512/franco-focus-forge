import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";

const OUT = "/home/devmat/BC4/audit/popup-20261031T0045Z";
const PW = readFileSync("/home/devmat/BC4/.secrets/admin_pw", "utf8").trim();
const BASE = "http://185.248.33.125:5174";
const PROJECT = "43e81a34a073";

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[name="username"]', { timeout: 20000 });
  await page.fill('input[name="username"]', "admin@bc4.local");
  await page.fill('input[name="password"]', PW);
  await page.locator('form button:has-text("Se connecter")').click();
  await page.waitForURL(/\/(projects|change-password|kpi|map|signaling)/, { timeout: 20000 });
  await page.evaluate((pid) => {
    localStorage.setItem('bc4.activeProject.v1.admin@bc4.local', JSON.stringify({ id: pid, name: "Test_6" }));
  }, PROJECT);
}

async function probe(browser, cap) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  const errs = [];
  const api = { table: null };
  page.on("console", m => { if (m.type()==="error") errs.push(m.text().slice(0,200)); });
  page.on("response", async r => {
    const u = r.url();
    if (/\/metrics\/table\?/.test(u) && r.status()===200) {
      try { api.table = await r.json(); } catch (_) {}
    }
  });
  await login(page);
  await page.goto(`${BASE}/map?capture=${cap}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".maplibregl-canvas", { timeout: 30000 });
  await page.waitForResponse(r => /\/metrics\/table\?/.test(r.url()) && r.status()===200, { timeout: 90000 }).catch(()=>null);
  await page.waitForTimeout(4000);

  // Expand drive-rsrp panel for toggles/legend
  const driveRsrpButton = page.locator('button:has-text("Drive RSRP")').first();
  if (await driveRsrpButton.isVisible().catch(()=>false)) {
    try { await driveRsrpButton.click({ timeout: 2000 }); } catch(_) {}
    await page.waitForTimeout(800);
  }
  const panelText = await page.locator("body").innerText().catch(()=>"");
  const panel = {
    serving: /Serving|serving/i.test(panelText),
    neighbour: /Voisin|Neighbour|neighbour/i.test(panelText),
    nr: /ancre NR|NR anchor|\bNR\b/i.test(panelText),
    legend_proven: /proven|plein/i.test(panelText),
    legend_probable: /probable|pointill/i.test(panelText),
  };
  await page.screenshot({ path: `${OUT}/map-${cap}-panel.png`, fullPage: false });

  // Click a real point: compute central lng/lat and attempt grid clicks
  let click = { ok: false, reason: "no-metrics-table" };
  const mp = api.table?.map_points ?? [];
  if (mp.length) {
    // Serving data stats
    const sorted = mp.filter(p => p.lat && p.lng).slice().sort((a,b) => a.lat - b.lat);
    const p0 = sorted[Math.floor(sorted.length/2)];
    const canvas = await page.locator(".maplibregl-canvas").first();
    const box = await canvas.boundingBox();
    if (box) {
      const cx = box.x + box.width/2, cy = box.y + box.height/2;
      // Try concentric spiral
      const tries = [];
      for (let r = 2; r <= 500; r += 3) {
        for (let a = 0; a < 360; a += 15) {
          tries.push([cx + r*Math.cos(a*Math.PI/180), cy + r*Math.sin(a*Math.PI/180)]);
        }
      }
      for (let i = 0; i < tries.length; i++) {
        const [px, py] = tries[i];
        await page.mouse.click(px, py);
        const popup = page.locator(".measurement-point-popup").first();
        const visible = await popup.isVisible().catch(()=>false);
        if (visible) {
          const text = await popup.innerText().catch(()=>"");
          if (/dBm|PCI|EARFCN|Serving/i.test(text)) {
            click = { ok: true, text: text.slice(0,700), at: [Math.round(px-box.x), Math.round(py-box.y)], tried: i+1 };
            break;
          }
        }
        if (i > 2000) break;
      }
      if (!click.ok) click.reason = `scanned_${tries.length}_no_popup`;
    }
  }
  if (click.ok) {
    await page.screenshot({ path: `${OUT}/map-${cap}-popup.png`, fullPage: false });
  }

  const dataStats = (() => {
    const stats = { total: mp.length, proven_serving: 0, probable_serving: 0, probable_neighbour: 0, nr_anchor: 0, methods: {} };
    for (const p of mp) {
      const m = p.link_method, c = p.confidence;
      const key = `${m}|${c}`;
      stats.methods[key] = (stats.methods[key]||0)+1;
      if (p.serving_cell_ref_id && c === "proven") stats.proven_serving++;
      else if (p.serving_cell_ref_id && c === "probable") stats.probable_serving++;
      stats.probable_neighbour += (p.neighbour_links||[]).length;
      if (p.nr_anchor_link) stats.nr_anchor++;
    }
    return stats;
  })();
  await ctx.close();
  return { cap, panel, click, dataStats, errs: errs.slice(0,5) };
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const out = {};
  for (const cap of ["a4b0c321c52e", "ecffb18dbd7f"]) {
    try { out[cap] = await probe(browser, cap); } catch (e) { out[cap] = { error: e.message }; }
  }
  await browser.close();
  writeFileSync(`${OUT}/results4.json`, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
})();
