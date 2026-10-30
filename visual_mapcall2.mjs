import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
const OUT = "/home/devmat/BC4/audit/visual-20261030T2130Z";
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

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
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
      const match = requests.find(x => x.url === u.replace("http://127.0.0.1:5174", "") && !("status" in x));
      if (match) {
        match.status = r.status();
        match.duration_ms = Date.now() - t0 - match.start_ms;
      }
    }
  });

  await login(page);
  await page.goto("http://127.0.0.1:5174/kpi?capture=a4b0c321c52e", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  // Metrics tab
  const metricsTab = page.locator('[role="tab"]:has-text("Metrics"), button:has-text("Metrics")').first();
  if (await metricsTab.count()) await metricsTab.click();
  await page.waitForTimeout(1800);
  // Expand "Radio quality" (available in Metrics catalogue)
  const rq = page.getByText(/^Radio quality$/i).first();
  if (await rq.count()) await rq.click();
  await page.waitForTimeout(800);
  // Pick a radio quality leaf — LTE RSRP (should have 4935 points)
  const leaf = page.getByText(/^LTE RSRP$/i).first();
  const t_leaf = Date.now();
  if (await leaf.count()) await leaf.click();
  await page.waitForTimeout(2000);
  // Open visualization menu via "..." on the chart card
  const dots = page.locator('button[aria-label*="Options"], button:has-text("…"), .lucide-ellipsis').first();
  if (await dots.count()) await dots.click();
  await page.waitForTimeout(500);
  // Try the Visualization popover - click 'Map' item
  const mapItem = page.locator('[role="menuitem"]:has-text("Map"), li:has-text("Map"), button:has-text("Map")').last();
  const beforeMapClick = requests.length;
  if (await mapItem.count()) await mapItem.click();
  await page.waitForTimeout(500);
  // Wait for canvas
  await page.waitForSelector('.maplibregl-canvas, canvas', { timeout: 20000 }).catch(()=>{});
  const t_canvas = Date.now();
  // Wait points to render (polling for /metrics/map response)
  await page.waitForTimeout(4000);
  const t_rendered = Date.now();
  // Only requests AFTER map view click
  const afterMap = requests.slice(beforeMapClick);
  const mapCalls = afterMap.filter(r => /\/metrics\/map/.test(r.url));
  const tableCalls = afterMap.filter(r => /\/metrics\/table/.test(r.url));
  const tools = await page.evaluate(() => {
    const n = Array.from(document.querySelectorAll('.maplibregl-ctrl button, button[aria-label], [data-testid*="tool"]'));
    return [...new Set(n.map(x => x.getAttribute("aria-label") || x.getAttribute("title") || "").filter(Boolean))];
  });
  await page.screenshot({ path: `${OUT}/01b-kpi-map.png`, fullPage: false });
  writeFileSync(`${OUT}/kpimap_v2.json`, JSON.stringify({
    total_ms_from_leaf_click: t_rendered - t_leaf,
    canvas_ms: t_canvas - t_leaf,
    metrics_map_calls_count: mapCalls.length,
    metrics_table_calls_count: tableCalls.length,
    metrics_map_calls: mapCalls,
    metrics_table_calls: tableCalls,
    tools, tool_count: tools.length,
    all_after_map: afterMap.filter(r => r.url.startsWith("/api/")),
  }, null, 2));
  console.log(JSON.stringify({
    total_ms: t_rendered - t_leaf,
    canvas_ms: t_canvas - t_leaf,
    metrics_map_count: mapCalls.length,
    metrics_table_count: tableCalls.length,
    map_requests: mapCalls,
    tool_count: tools.length,
  }, null, 2));
  await ctx.close();
  await browser.close();
})();
