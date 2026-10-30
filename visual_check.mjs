import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const OUT = "/home/devmat/BC4/audit/visual-20261030T1945Z";
mkdirSync(OUT, { recursive: true });
const PW = readFileSync("/home/devmat/BC4/.secrets/admin_pw", "utf8").trim();
const BASE = "http://127.0.0.1:5174";
const PROJ = "43e81a34a073";
const CAP = "a4b0c321c52e";
const EMAIL = "admin@bc4.local";

function logger(page, bucket) {
  page.on("console", (m) => bucket.console.push({ type: m.type(), text: m.text().slice(0, 500) }));
  page.on("pageerror", (e) => bucket.pageerrors.push(String(e).slice(0, 500)));
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[name="username"]', { timeout: 15000 });
  await page.fill('input[name="username"]', EMAIL);
  await page.fill('input[name="password"]', PW);
  await page.locator('form button:has-text("Se connecter")').click();
  await page.waitForURL(/\/(projects|change-password|kpi|map|signaling)/, { timeout: 15000 });
  await page.evaluate(({ proj, email }) => {
    localStorage.setItem(`bc4.activeProject.v1.${email}`, JSON.stringify({ id: proj, name: "Test_6" }));
  }, { proj: PROJ, email: EMAIL });
}

async function captureKpiMetrics(browser, results) {
  const bucket = { console: [], pageerrors: [] };
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  logger(page, bucket);
  const t0 = Date.now();
  await login(page);
  await page.goto(`${BASE}/kpi?capture=${CAP}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  const metricsTab = page.locator('[role="tab"]:has-text("Metrics"), button:has-text("Metrics")').first();
  if (await metricsTab.count()) { await metricsTab.click(); await page.waitForTimeout(2500); }
  const sidebarCount = await page.locator('aside, [data-testid*="sidebar"], [data-testid*="metrics-catalog"]').count();
  const panelInKpiArea = await page.locator('[data-testid*="kpi-metrics"], [data-testid*="metrics-sidebar"], [data-testid*="metrics-catalog"]').count();
  const searchFields = await page.locator('input[type="search"], input[placeholder*="echerch" i], input[placeholder*="search" i]').count();
  const hasShowUnavailable = (await page.getByText(/afficher les non.disponibles|show unavailable/i).count()) > 0;
  const hasActiveOnly = (await page.getByText(/actifs uniquement|active only/i).count()) > 0;
  const noMatch = await page.getByText(/No KPIs match this search/i).count();
  await page.screenshot({ path: `${OUT}/01-kpi-analytics-metrics.png`, fullPage: false });
  results.push({ page: "KPI Analytics · Metrics", metrics: { sidebar_count: sidebarCount, kpi_metrics_panels: panelInKpiArea, search_fields: searchFields, show_unavailable: hasShowUnavailable, active_only: hasActiveOnly, no_match_block: noMatch, elapsed_ms: Date.now() - t0, console_errors: bucket.console.filter(c => c.type === "error").length, console_warnings: bucket.console.filter(c => c.type === "warning").length, pageerrors: bucket.pageerrors.length } });
  const kpiTab = page.locator('[role="tab"]:has-text("KPI"), button:has-text("KPI")').first();
  if (await kpiTab.count()) { await kpiTab.click(); await page.waitForTimeout(2500); }
  const kpiLeaves = await page.locator('[data-testid*="kpi-leaf"], [data-kpi]').count();
  const kpiCountText = await page.locator('[role="tab"]:has-text("KPI"), button:has-text("KPI")').first().innerText().catch(() => "");
  await page.screenshot({ path: `${OUT}/02-kpi-tab.png`, fullPage: false });
  results.push({ page: "KPI tab", metrics: { kpi_leaves: kpiLeaves, tab_text: kpiCountText.slice(0, 120) } });
  const paramTab = page.locator('[role="tab"]:has-text("Parameters"), button:has-text("Parameters")').first();
  if (await paramTab.count()) { await paramTab.click(); await page.waitForTimeout(4000); }
  const bodyText = await page.locator('body').innerText().catch(() => "");
  const stuckChargement = /Chargement/i.test(bodyText);
  await page.screenshot({ path: `${OUT}/03-parameters-tab.png`, fullPage: false });
  results.push({ page: "Parameters tab", metrics: { stuck_on_chargement: stuckChargement } });
  await ctx.close();
  writeFileSync(`${OUT}/kpi_console.json`, JSON.stringify(bucket, null, 2));
}

async function captureKpiMap(browser, results) {
  const bucket = { console: [], pageerrors: [] };
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  logger(page, bucket);
  const t0 = Date.now();
  await login(page);
  await page.goto(`${BASE}/kpi?capture=${CAP}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  const metricsTab = page.locator('[role="tab"]:has-text("Metrics"), button:has-text("Metrics")').first();
  if (await metricsTab.count()) await metricsTab.click();
  await page.waitForTimeout(2000);
  const serving = page.getByText(/Serving.*LTE|RSRP.*Serving/i).first();
  const t_leaf = Date.now();
  if (await serving.count()) await serving.click();
  await page.waitForTimeout(500);
  const mapView = page.locator('button[aria-label*="map" i], button:has-text("Map"), button:has-text("Carte"), [aria-label="Carte"]').first();
  if (await mapView.count()) await mapView.click();
  await page.waitForSelector('.maplibregl-canvas, canvas', { timeout: 20000 }).catch(() => {});
  const t_canvas = Date.now();
  await page.getByText(/RSRP.*dBm/i).first().waitFor({ timeout: 30000 }).catch(() => {});
  const t_legend = Date.now();
  await page.waitForTimeout(3000);
  const t_total = Date.now();
  const tools = await page.locator('.maplibregl-ctrl button, [data-testid*="map-tool"]').evaluateAll(ns => ns.map(n => n.getAttribute("aria-label") || n.getAttribute("title") || n.textContent?.trim()?.slice(0, 40)).filter(Boolean));
  const linksMenu = await page.getByText(/cellule servante|voisines|neighbour|NR anchor|serving|ancre NR/i).count();
  await page.screenshot({ path: `${OUT}/04-kpi-map-rsrp-lte-serving.png`, fullPage: false });
  results.push({ page: "KPI Map · RSRP LTE Serving", metrics: {
    leaf_click_rel_ms: t_leaf - t0,
    canvas_ms: t_canvas - t_leaf,
    legend_rsrp_ms: t_legend - t_canvas,
    total_render_ms: t_total - t_leaf,
    tool_count: tools.length, tool_labels: tools,
    links_menu_hits: linksMenu,
    console_errors: bucket.console.filter(c => c.type === "error").length,
    console_warnings: bucket.console.filter(c => c.type === "warning").length,
    pageerrors: bucket.pageerrors.length,
  }});
  await ctx.close();
  writeFileSync(`${OUT}/kpimap_console.json`, JSON.stringify(bucket, null, 2));
  return tools;
}

async function captureMapPage(browser, results) {
  const bucket = { console: [], pageerrors: [] };
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  logger(page, bucket);
  await login(page);
  await page.goto(`${BASE}/map?capture=${CAP}`, { waitUntil: "networkidle" });
  await page.waitForSelector('.maplibregl-canvas, canvas', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(3000);
  const tools = await page.locator('.maplibregl-ctrl button, [data-testid*="map-tool"]').evaluateAll(ns => ns.map(n => n.getAttribute("aria-label") || n.getAttribute("title") || n.textContent?.trim()?.slice(0, 40)).filter(Boolean));
  await page.screenshot({ path: `${OUT}/05-map-page.png`, fullPage: false });
  results.push({ page: "Map page", metrics: { tool_count: tools.length, tool_labels: tools, console_errors: bucket.console.filter(c => c.type === "error").length, console_warnings: bucket.console.filter(c => c.type === "warning").length } });
  await ctx.close();
  return tools;
}

async function captureSignaling(browser, results) {
  const bucket = { console: [], pageerrors: [] };
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  logger(page, bucket);
  await login(page);
  const t0 = Date.now();
  await page.goto(`${BASE}/signaling?capture=${CAP}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  const timeline = page.locator('[data-testid*="timeline"], [data-testid*="rf-timeline"], svg[aria-label*="imeline" i], svg[aria-label*="rise" i]').first();
  await timeline.waitFor({ timeout: 20000 }).catch(() => {});
  const t_timeline = Date.now();
  const tools = await page.locator('.maplibregl-ctrl button, [data-testid*="map-tool"]').evaluateAll(ns => ns.map(n => n.getAttribute("aria-label") || n.getAttribute("title") || n.textContent?.trim()?.slice(0, 40)).filter(Boolean));
  const unknown = await page.getByText(/\bUnknown\b/).count();
  const rrcState = (await page.getByText(/RRC State|RRC Connected|RRC Idle/i).count()) > 0;
  const ueState = (await page.getByText(/UE State|LTE Connected|LTE Idle/i).count()) > 0;
  await page.screenshot({ path: `${OUT}/06-signaling.png`, fullPage: false });
  results.push({ page: "Signaling", metrics: {
    total_ms: Date.now() - t0,
    timeline_ms: t_timeline - t0,
    tool_count: tools.length, tool_labels: tools,
    unknown_hits: unknown, rrc_state_present: rrcState, ue_state_present: ueState,
    console_errors: bucket.console.filter(c => c.type === "error").length,
    console_warnings: bucket.console.filter(c => c.type === "warning").length,
  }});
  await ctx.close();
  writeFileSync(`${OUT}/signaling_console.json`, JSON.stringify(bucket, null, 2));
  return tools;
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const results = [];
  try { await captureKpiMetrics(browser, results); } catch (e) { console.error("kpi-metrics ERR:", e.message); results.push({ page: "KPI Analytics · Metrics", error: e.message }); }
  let kpiMapTools = []; try { kpiMapTools = await captureKpiMap(browser, results); } catch (e) { console.error("kpimap ERR:", e.message); results.push({ page: "KPI Map", error: e.message }); }
  let mapTools = []; try { mapTools = await captureMapPage(browser, results); } catch (e) { console.error("map ERR:", e.message); results.push({ page: "Map page", error: e.message }); }
  let sigTools = []; try { sigTools = await captureSignaling(browser, results); } catch (e) { console.error("signaling ERR:", e.message); results.push({ page: "Signaling", error: e.message }); }
  await browser.close();
  const comparison = {
    kpi_map_tools: kpiMapTools, map_page_tools: mapTools, signaling_tools: sigTools,
    kpi_vs_map_identical: JSON.stringify([...kpiMapTools].sort()) === JSON.stringify([...mapTools].sort()),
    kpi_vs_signaling_identical: JSON.stringify([...kpiMapTools].sort()) === JSON.stringify([...sigTools].sort()),
  };
  writeFileSync(`${OUT}/results.json`, JSON.stringify({ results, comparison }, null, 2));
  console.log(JSON.stringify({ results, comparison }, null, 2));
})();
