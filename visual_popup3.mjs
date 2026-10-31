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
  const apiMetrics = { metricsMap: null };
  page.on("console", m => { if (m.type()==="error") errs.push(m.text().slice(0,200)); });
  page.on("response", async r => {
    const u = r.url();
    if (u.includes("/metrics/map") && r.status()===200) {
      try { apiMetrics.metricsMap = await r.json(); } catch (_) {}
    }
  });
  await login(page);
  await page.goto(`${BASE}/map?capture=${cap}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".maplibregl-canvas", { timeout: 30000 });
  // Wait for the drive layer to actually fetch and render
  await page.waitForResponse(r => r.url().includes("/metrics/map") && r.status()===200, { timeout: 60000 }).catch(()=>null);
  await page.waitForTimeout(4000);

  const bodyText = await page.locator("body").innerText().catch(()=>"");
  const toggles = {
    serving_text: /Serving|serving/i.test(bodyText),
    neighbour_text: /Voisin|Neighbour|neighbour/i.test(bodyText),
    nr_text: /\bNR\b|ancre NR|NR anchor/i.test(bodyText),
  };
  const legend = {
    text_proven: /proven|plein/i.test(bodyText),
    text_probable: /probable|pointill/i.test(bodyText),
  };
  // Look for the drive-rsrp panel chevron (expanded view with toggles + legend)
  // The panel might be collapsed. Click it to expand.
  const driveRsrpButton = page.locator('button:has-text("Drive RSRP")').first();
  if (await driveRsrpButton.isVisible().catch(()=>false)) {
    try { await driveRsrpButton.click({ timeout: 2000 }); } catch(_) {}
    await page.waitForTimeout(800);
  }
  const panelText = await page.locator("body").innerText().catch(()=>"");
  const panelHas = {
    serving: /Serving|serving/i.test(panelText),
    neighbour: /Voisin|Neighbour|neighbour/i.test(panelText),
    nr: /ancre NR|NR anchor|NR\b/i.test(panelText),
    legend_proven: /proven|plein/i.test(panelText),
    legend_probable: /probable|pointill/i.test(panelText),
  };
  await page.screenshot({ path: `${OUT}/map-${cap}-panel.png`, fullPage: false });

  // Compute click point from REAL data
  let click = { ok: false, reason: "no-metrics-map" };
  if (apiMetrics.metricsMap?.map_points?.length) {
    // Choose the median point by lat
    const pts = apiMetrics.metricsMap.map_points.filter(p => p.lat && p.lng);
    const sorted = pts.slice().sort((a,b) => a.lat - b.lat);
    const p0 = sorted[Math.floor(sorted.length/2)];
    // Compute pixel position via page evaluation of maplibre instance
    const pixel = await page.evaluate(async ({lng, lat}) => {
      // Find map instance: Maplibre attaches an internal data to the canvas container
      const container = document.querySelector(".maplibregl-map");
      if (!container) return null;
      // Walk up props to find React fiber with map ref — brittle; try window first
      const w = window;
      let map = w.__bc4_map__ || null;
      if (!map) {
        // Try to walk the DOM to find map object via maplibre convention
        // maplibre stores reference via `_map` property on some elements, not reliably exposed
        return null;
      }
      const point = map.project([lng, lat]);
      const rect = container.getBoundingClientRect();
      return { x: rect.left + point.x, y: rect.top + point.y };
    }, { lng: p0.lng, lat: p0.lat });

    // Fallback: scan a grid, but prefer central area where auto-frame put the route
    const canvas = await page.locator(".maplibregl-canvas").first();
    const box = await canvas.boundingBox();
    if (box) {
      const cx = pixel?.x ?? box.x + box.width/2;
      const cy = pixel?.y ?? box.y + box.height/2;
      // Dense fine grid near chosen point
      const tries = [];
      for (let r = 0; r <= 40; r += 2) {
        for (let a = 0; a < 360; a += 20) {
          const dx = r * Math.cos(a*Math.PI/180);
          const dy = r * Math.sin(a*Math.PI/180);
          tries.push([cx + dx, cy + dy]);
        }
      }
      for (const [px, py] of tries) {
        await page.mouse.click(px, py);
        await page.waitForTimeout(60);
        const popup = page.locator(".measurement-point-popup").first();
        if (await popup.isVisible().catch(()=>false)) {
          const text = await popup.innerText().catch(()=>"");
          if (/dBm|PCI|EARFCN|Serving/i.test(text)) {
            click = { ok: true, text: text.slice(0,600), at: [px, py] };
            break;
          }
        }
      }
      if (!click.ok) click.reason = "no-popup-after-grid";
    }
  }
  if (click.ok) {
    await page.screenshot({ path: `${OUT}/map-${cap}-popup.png`, fullPage: false });
  }

  // Count data stats
  const dataStats = (() => {
    const mp = apiMetrics.metricsMap?.map_points ?? [];
    const stats = { total: mp.length, proven_serving: 0, probable_serving: 0, probable_neighbour: 0, nr_anchor: 0, methods: {} };
    for (const p of mp) {
      const m = p.link_method, c = p.confidence;
      stats.methods[`${m}|${c}`] = (stats.methods[`${m}|${c}`]||0)+1;
      if (p.serving_cell_ref_id && c === "proven") stats.proven_serving++;
      else if (p.serving_cell_ref_id && c === "probable") stats.probable_serving++;
      stats.probable_neighbour += (p.neighbour_links||[]).length;
      if (p.nr_anchor_link) stats.nr_anchor++;
    }
    return stats;
  })();

  await ctx.close();
  return { cap, toggles, panelHas, legend, click, dataStats, errs: errs.slice(0,5) };
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const out = {};
  for (const cap of ["a4b0c321c52e", "ecffb18dbd7f"]) {
    try { out[cap] = await probe(browser, cap); } catch (e) { out[cap] = { error: e.message }; }
  }
  await browser.close();
  writeFileSync(`${OUT}/results3.json`, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
})();
