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
}

async function probe(browser, cap) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  const errs = [];
  const api = { tables: [] };
  page.on("console", m => { if (m.type()==="error") errs.push(m.text().slice(0,200)); });
  page.on("response", async r => {
    const u = r.url();
    if (/\/metrics\/table\?/.test(u) && r.status()===200) {
      try { const j = await r.json(); api.tables.push({ url: u.slice(u.indexOf("/metrics/")), map_points: j.map_points?.length ?? 0 }); api.lastTable = j; api.lastUrl = u; } catch (_) {}
    }
  });
  await login(page);
  // Set capture + project explicitly in localStorage, clear other map keys
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
  await page.waitForTimeout(5000);

  // Expand drive-rsrp panel
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

  // Find a point with serving link; click near it
  const mp = api.lastTable?.map_points ?? [];
  // Try a point WITH serving cell
  let targetPoint = mp.find(p => p.serving_cell_ref_id && p.lat && p.lng);
  if (!targetPoint) targetPoint = mp.find(p => p.lat && p.lng);

  let click = { ok: false, reason: "no-target-point" };
  if (targetPoint) {
    // Compute the pixel position via maplibre: inject a probe into the page
    const pxy = await page.evaluate(({ lng, lat }) => {
      // Scan canvases to find the maplibre map instance via internal field
      const canvases = Array.from(document.querySelectorAll(".maplibregl-canvas"));
      for (const c of canvases) {
        // Each canvas has a reference back to the Map through its parent
        // Walk up to find the maplibregl-map container
        let container = c.closest(".maplibregl-map");
        if (!container) continue;
        // Maplibre keeps the map in `container.__maplibreglMap` sometimes; try common hooks
        const keys = Object.keys(container);
        const hiddenMapKey = keys.find(k => k.startsWith("__") && container[k]?.project);
        const map = container.__map || container._map || (hiddenMapKey ? container[hiddenMapKey] : null);
        if (map && typeof map.project === "function") {
          const p = map.project([lng, lat]);
          const rect = container.getBoundingClientRect();
          return { x: rect.left + p.x, y: rect.top + p.y, found: true };
        }
      }
      return { found: false };
    }, { lng: targetPoint.lng, lat: targetPoint.lat });

    const canvas = await page.locator(".maplibregl-canvas").first();
    const box = await canvas.boundingBox();
    if (box) {
      let cx, cy;
      if (pxy.found) { cx = pxy.x; cy = pxy.y; }
      else { cx = box.x + box.width/2; cy = box.y + box.height/2; }
      // Dense spiral around chosen center
      const tries = [];
      for (let r = 0; r <= 200; r += 2) {
        for (let a = 0; a < 360; a += 10) {
          tries.push([cx + r*Math.cos(a*Math.PI/180), cy + r*Math.sin(a*Math.PI/180)]);
        }
      }
      for (let i = 0; i < Math.min(tries.length, 1500); i++) {
        const [px, py] = tries[i];
        await page.mouse.click(px, py);
        const popup = page.locator(".measurement-point-popup").first();
        if (await popup.isVisible().catch(()=>false)) {
          const text = await popup.innerText().catch(()=>"");
          if (/dBm|PCI|EARFCN|Serving/i.test(text) && /Serving cell|PCI/.test(text)) {
            click = { ok: true, text: text.slice(0,900), at: [Math.round(px-box.x), Math.round(py-box.y)], tried: i+1 };
            break;
          }
          // Keep the first popup seen but keep searching for a complete one
          if (!click.ok && text.length > 30) click = { ok: true, text: text.slice(0,900), at: [Math.round(px-box.x), Math.round(py-box.y)], tried: i+1, partial: true };
        }
      }
      if (!click.ok) click.reason = "no_popup_in_spiral";
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
  return { cap, lastUrl: (api.lastUrl||"").slice(Math.max(0, (api.lastUrl||"").indexOf("/metrics/"))), tables_count: api.tables.length, panel, click, dataStats, errs: errs.slice(0,5) };
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const out = {};
  for (const cap of ["a4b0c321c52e", "ecffb18dbd7f"]) {
    try { out[cap] = await probe(browser, cap); } catch (e) { out[cap] = { error: e.message }; }
  }
  await browser.close();
  writeFileSync(`${OUT}/results5.json`, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
})();
