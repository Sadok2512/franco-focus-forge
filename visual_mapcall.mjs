import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
const OUT = "/home/devmat/BC4/audit/visual-20261030T2130Z";
import { mkdirSync } from "node:fs"; mkdirSync(OUT, { recursive: true });
const PW = readFileSync("/home/devmat/BC4/.secrets/admin_pw", "utf8").trim();

async function login(page) {
  await page.goto("http://127.0.0.1:5174/login", { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[name="username"]');
  await page.fill('input[name="username"]', "admin@bc4.local");
  await page.fill('input[name="password"]', PW);
  await page.locator('form button:has-text("Se connecter")').click();
  await page.waitForURL(/\/(projects|kpi|signaling|map)/, { timeout: 15000 });
  await page.evaluate(() => localStorage.setItem('bc4.activeProject.v1.admin@bc4.local', JSON.stringify({ id: "43e81a34a073", name: "Test_6" })));
}

async function kpiMap(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  const requests = [];
  const t0 = Date.now();
  page.on("request", (r) => {
    const u = r.url();
    if (u.includes("/api/")) requests.push({ url: u.replace("http://127.0.0.1:5174", ""), method: r.method(), start_ms: Date.now() - t0 });
  });
  page.on("response", async (r) => {
    const u = r.url();
    if (u.includes("/api/")) {
      const match = requests.find(x => x.url === u.replace("http://127.0.0.1:5174", "") && !x.status);
      if (match) {
        match.status = r.status();
        match.duration_ms = Date.now() - t0 - match.start_ms;
        try { const h = r.headers(); match.cl = h["content-length"]; } catch {}
      }
    }
  });

  await login(page);
  await page.goto("http://127.0.0.1:5174/kpi?capture=a4b0c321c52e", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const metricsTab = page.locator('[role="tab"]:has-text("Metrics"), button:has-text("Metrics")').first();
  if (await metricsTab.count()) await metricsTab.click();
  await page.waitForTimeout(2000);
  // Pick a selectable leaf (LTE RRC Setup Latency is visible in prior shots)
  const leaf = page.getByText(/LTE RRC Setup Latency|RSRP|Serving/i).first();
  const t_leaf = Date.now();
  if (await leaf.count()) await leaf.click();
  await page.waitForTimeout(1000);
  // Open visualization menu, click Map
  // The chart card has a "…" or specific viz selector; try Add a chart first
  const addChart = page.getByText(/Add a chart|Ajouter un graphique/i).first();
  if (await addChart.count()) await addChart.click();
  await page.waitForTimeout(500);
  const mapItem = page.locator('[role="menuitem"]:has-text("Map"), button:has-text("Map"), li:has-text("Map")').first();
  if (await mapItem.count()) await mapItem.click();
  await page.waitForTimeout(500);
  // Confirm or wait for canvas
  await page.waitForSelector('.maplibregl-canvas, canvas', { timeout: 20000 }).catch(()=>{});
  const t_canvas = Date.now();
  // Count map/map_points calls after t_leaf
  await page.waitForTimeout(3000);
  const t_rendered = Date.now();
  const metricsMapCalls = requests.filter(r => /\/metrics\/map/.test(r.url));
  const metricsTableCalls = requests.filter(r => /\/metrics\/table/.test(r.url));
  const tools = await page.evaluate(() => {
    const n = Array.from(document.querySelectorAll('.maplibregl-ctrl button, button[aria-label], [data-testid*="tool"]'));
    return [...new Set(n.map(x => x.getAttribute("aria-label") || x.getAttribute("title") || "").filter(Boolean))];
  });
  await page.screenshot({ path: `${OUT}/01-kpi-map.png`, fullPage: false });
  writeFileSync(`${OUT}/kpimap_requests.json`, JSON.stringify({
    total_ms_from_leaf_click: t_rendered - t_leaf,
    canvas_mounted_ms: t_canvas - t_leaf,
    metrics_map_calls_count: metricsMapCalls.length,
    metrics_table_calls_count: metricsTableCalls.length,
    metrics_map_calls: metricsMapCalls,
    tools, tool_count: tools.length,
    all_requests: requests.filter(r => /metrics|dict|signaling|sites/.test(r.url)),
  }, null, 2));
  await ctx.close();
  return { tools, metrics_map_calls: metricsMapCalls, metrics_table_calls: metricsTableCalls, total_ms: t_rendered - t_leaf };
}

async function signalingCascade(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  const requests = [];
  const t0 = Date.now();
  page.on("request", (r) => {
    const u = r.url();
    if (u.includes("/api/") || u.includes("/assets/")) {
      requests.push({ url: u.replace("http://127.0.0.1:5174", ""), method: r.method(), start_ms: Date.now() - t0 });
    }
  });
  page.on("response", async (r) => {
    const u = r.url();
    if (u.includes("/api/") || u.includes("/assets/")) {
      const match = requests.find(x => x.url === u.replace("http://127.0.0.1:5174", "") && !("status" in x));
      if (match) {
        match.status = r.status();
        match.duration_ms = Date.now() - t0 - match.start_ms;
        try { match.cl = r.headers()["content-length"]; } catch {}
      }
    }
  });

  await login(page);
  const t_nav = Date.now();
  await page.goto("http://127.0.0.1:5174/signaling?capture=a4b0c321c52e", { waitUntil: "domcontentloaded" });
  // Wait for timeline visually - look for SVG axis
  await page.waitForTimeout(5500);
  const t_rendered = Date.now();
  // Just /api requests
  const apiReqs = requests.filter(r => r.url.startsWith("/api/"));
  await page.screenshot({ path: `${OUT}/02-signaling-cascade.png`, fullPage: false });
  writeFileSync(`${OUT}/signaling_cascade.json`, JSON.stringify({
    nav_to_rendered_ms: t_rendered - t_nav,
    api_request_count: apiReqs.length,
    api_requests: apiReqs.map(r => ({ url: r.url.length > 150 ? r.url.slice(0,150)+"..." : r.url, start_ms: r.start_ms, duration_ms: r.duration_ms, status: r.status })),
    total_backend_time: apiReqs.reduce((s,r) => s + (r.duration_ms || 0), 0),
  }, null, 2));
  await ctx.close();
  return { nav_to_rendered_ms: t_rendered - t_nav, api_requests: apiReqs };
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const kpi = await kpiMap(browser);
  const sig = await signalingCascade(browser);
  await browser.close();
  console.log(JSON.stringify({ kpi, sig }, null, 2));
})();
