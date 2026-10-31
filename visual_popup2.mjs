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
    if (u.includes("/metrics/map?") && r.status()===200) {
      try { apiMetrics.metricsMap = await r.json(); } catch (_) {}
    }
  });
  await login(page);
  await page.goto(`${BASE}/map?capture=${cap}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".maplibregl-canvas", { timeout: 25000 });
  await page.waitForTimeout(8000);
  // Scan the live rendered DOM for toggles + legend
  const bodyText = await page.locator("body").innerText().catch(()=>"");
  const toggles = {
    serving_text: /Serving/i.test(bodyText),
    neighbour_text: /Voisin|Neighbour/i.test(bodyText),
    nr_text: /\bNR\b|ancre NR|NR anchor/i.test(bodyText),
  };
  const legend = {
    text_proven: /proven|plein/i.test(bodyText),
    text_probable: /probable|pointill/i.test(bodyText),
    text_full: bodyText.match(/Link styles[\s\S]{0,300}|Styles de lien[\s\S]{0,300}|proven[\s\S]{0,200}probable/i)?.[0] ?? null,
  };
  // Click the "Drive RSRP" button to make sure the layer is on
  // Then wait for metrics/map
  // Compute click coordinates from a real map point via /metrics/map response
  let click = { ok:false, reason: "no-metrics-map" };
  if (apiMetrics.metricsMap?.map_points?.length) {
    const pts = apiMetrics.metricsMap.map_points.filter(p => p.lat && p.lng);
    const p0 = pts[Math.floor(pts.length/2)]; // central point
    // Compute pixel from lng/lat via maplibre style projection — need map instance
    // Fallback: assume map is auto-framed on route center and points are near canvas center
    // Try grid pattern with many offsets
    const canvas = await page.locator(".maplibregl-canvas").first();
    const box = await canvas.boundingBox();
    if (box) {
      const cx = box.x + box.width/2, cy = box.y + box.height/2;
      const offsets = [];
      for (let dx = -300; dx <= 300; dx += 15) for (let dy = -200; dy <= 200; dy += 15) offsets.push([dx,dy]);
      // Shuffle to spread hits
      offsets.sort(() => Math.random()-0.5);
      for (const [dx,dy] of offsets.slice(0, 160)) {
        await page.mouse.click(cx+dx, cy+dy);
        await page.waitForTimeout(80);
        const popup = page.locator(".measurement-point-popup, .maplibregl-popup-content").first();
        if (await popup.isVisible().catch(()=>false)) {
          const text = await popup.innerText().catch(()=>"");
          if (/dBm|PCI|EARFCN|Serving/i.test(text)) {
            click = { ok: true, text: text.slice(0,500), at: [dx,dy] };
            break;
          }
        }
      }
      if (!click.ok) click.reason = "scanned_grid_no_hit";
    }
  }
  await page.screenshot({ path: `${OUT}/map-${cap}-${click.ok ? 'popup' : 'nopopup'}.png`, fullPage: false });
  // Count proven/probable in metrics data
  const dataStats = (() => {
    const mp = apiMetrics.metricsMap?.map_points ?? [];
    const stats = { total: mp.length, proven_serving: 0, probable_serving: 0, probable_neighbour: 0, nr_anchor: 0 };
    for (const p of mp) {
      if (p.serving_cell_ref_id && p.confidence === "proven") stats.proven_serving++;
      else if (p.serving_cell_ref_id && p.confidence === "probable") stats.probable_serving++;
      stats.probable_neighbour += (p.neighbour_links||[]).length;
      if (p.nr_anchor_link) stats.nr_anchor++;
    }
    return stats;
  })();
  await ctx.close();
  return { cap, toggles, legend, click, dataStats, errs: errs.slice(0,5) };
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const out = {};
  for (const cap of ["a4b0c321c52e", "ecffb18dbd7f"]) {
    try { out[cap] = await probe(browser, cap); } catch (e) { out[cap] = { error: e.message }; }
  }
  await browser.close();
  writeFileSync(`${OUT}/results2.json`, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
})();
