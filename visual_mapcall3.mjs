import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
const OUT = "/home/devmat/BC4/audit/visual-20261030T2130Z";
const PW = readFileSync("/home/devmat/BC4/.secrets/admin_pw", "utf8").trim();

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
      if (match) { match.status = r.status(); match.duration_ms = Date.now() - t0 - match.start_ms; }
    }
  });

  await page.goto("http://127.0.0.1:5174/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[name="username"]', "admin@bc4.local");
  await page.fill('input[name="password"]', PW);
  await page.locator('form button:has-text("Se connecter")').click();
  await page.waitForURL(/\/(projects|kpi|signaling|map)/, { timeout: 15000 });
  await page.evaluate(() => localStorage.setItem('bc4.activeProject.v1.admin@bc4.local', JSON.stringify({ id: "43e81a34a073", name: "Test_6" })));

  // Direct call to /metrics/map via browser fetch (simulates frontend's own call)
  await page.goto("http://127.0.0.1:5174/kpi?capture=a4b0c321c52e", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  // Trigger a page.evaluate that calls /metrics/map directly to measure actual back time + see 1 call
  const result = await page.evaluate(async () => {
    const t = performance.now();
    const r = await fetch('/api/projects/43e81a34a073/metrics/map?codes=cell_rsrp@lte-type-0&capture_id=a4b0c321c52e');
    const b = await r.json();
    return { status: r.status, elapsed_ms: Math.round(performance.now() - t), points: (b.map_points || []).length, keys: Object.keys(b) };
  });
  console.log("direct fetch /metrics/map:", JSON.stringify(result));

  // Now actually trigger Map view by clicking in sidebar — a non-KPI leaf. Try "LTE RRC Setup Latency" (uses /metrics API path for Metrics)
  // Click Metrics tab
  const metricsTab = page.locator('[role="tab"]:has-text("Metrics"), button:has-text("Metrics")').first();
  if (await metricsTab.count()) await metricsTab.click();
  await page.waitForTimeout(1500);
  const beforeAll = requests.length;
  // Click a Metric leaf that uses /metrics/table/series — e.g., LTE RRC Setup Latency is also under Accessibility
  const leaf = page.locator('li:has-text("LTE RRC Setup Latency"), li:has-text("LTE RSRP")').first();
  if (await leaf.count()) await leaf.click();
  await page.waitForTimeout(2000);
  // open ... menu
  await page.locator('[aria-label*="Options"], button[title*="Options"], .lucide-ellipsis-vertical, .lucide-ellipsis').first().click().catch(()=>{});
  await page.waitForTimeout(500);
  const beforeMap = requests.length;
  // Click Map in visualization menu  
  await page.locator('button:has-text("Map"), [role="menuitem"]:has-text("Map")').last().click().catch(()=>{});
  const t_click_map = Date.now();
  await page.waitForTimeout(8000);
  const t_done = Date.now();
  const afterMap = requests.slice(beforeMap);
  const mapCalls = afterMap.filter(r => /\/metrics\/map/.test(r.url));
  const tableCalls = afterMap.filter(r => /\/metrics\/table/.test(r.url));
  await page.screenshot({ path: `${OUT}/01c-kpi-map.png` });
  writeFileSync(`${OUT}/kpimap_v3.json`, JSON.stringify({
    direct_fetch: result,
    time_from_map_click_to_done_ms: t_done - t_click_map,
    metrics_map_calls_count: mapCalls.length,
    metrics_table_calls_count: tableCalls.length,
    metrics_map_calls: mapCalls,
    metrics_table_calls: tableCalls,
    all_after_map: afterMap.filter(r => r.url.startsWith("/api/")),
  }, null, 2));
  console.log(JSON.stringify({ direct_fetch: result, map_calls: mapCalls.length, table_calls: tableCalls.length }));
  await ctx.close();
  await browser.close();
})();
