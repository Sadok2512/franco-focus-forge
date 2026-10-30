import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";

const OUT = "/home/devmat/BC4/audit/visual-20261030T1945Z";
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

async function kpiMap(browser, results) {
  const bucket = { console: [], pageerrors: [] };
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  logger(page, bucket);
  const t0 = Date.now();
  await login(page);
  await page.goto(`${BASE}/kpi?capture=${CAP}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  // Click Metrics tab (not KPI)
  await page.locator('[role="tab"]:has-text("Metrics"), button:has-text("Metrics")').first().click().catch(()=>{});
  await page.waitForTimeout(2000);
  // Expand Radio quality or MIMO
  const radioQual = page.getByText(/Radio quality/i).first();
  if (await radioQual.count()) await radioQual.click();
  await page.waitForTimeout(500);
  // Click first visible leaf (bullet dot item)
  const firstLeaf = page.locator('[data-testid*="metric-leaf"], li:has(.text-primary), li:has-text("RSRP")').first();
  const leafTxt = await firstLeaf.innerText().catch(()=>"");
  const t_leaf = Date.now();
  await firstLeaf.click().catch(()=>{});
  await page.waitForTimeout(1500);
  // Switch chart to Map (should be via workspace layout or chart menu)
  const addChart = page.getByText(/Add a chart|Ajouter un graphique/i).first();
  if (await addChart.count()) await addChart.click();
  await page.waitForTimeout(1000);
  const mapBtn = page.locator('button:has-text("Map"), button:has-text("Carte")').first();
  if (await mapBtn.count()) await mapBtn.click();
  await page.waitForSelector('.maplibregl-canvas, canvas', { timeout: 20000 }).catch(() => {});
  const t_canvas = Date.now();
  await page.waitForTimeout(5000);
  const t_done = Date.now();
  const tools = await page.locator('.maplibregl-ctrl button, [data-testid*="map-tool"]').evaluateAll(ns => ns.map(n => n.getAttribute("aria-label") || n.getAttribute("title") || n.textContent?.trim()?.slice(0, 40)).filter(Boolean));
  const toolCount = tools.length;
  const linksMenu = await page.getByText(/cellule servante|voisines|neighbour|serving|ancre NR|anchor/i).count();
  await page.screenshot({ path: `${OUT}/04b-kpi-map-rsrp-lte-serving.png`, fullPage: false });
  results.push({ page: "KPI Map · RSRP LTE Serving (v2)", metrics: {
    leaf_clicked: leafTxt.slice(0, 60),
    leaf_click_rel_ms: t_leaf - t0,
    canvas_ms: t_canvas - t_leaf,
    total_ms: t_done - t_leaf,
    tool_count: toolCount, tool_labels: tools,
    links_menu_hits: linksMenu,
    console_errors: bucket.console.filter(c => c.type === "error").length,
    console_warnings: bucket.console.filter(c => c.type === "warning").length,
    pageerrors: bucket.pageerrors.length,
  }});
  await ctx.close();
  writeFileSync(`${OUT}/kpimap_v2_console.json`, JSON.stringify(bucket, null, 2));
  return tools;
}

async function mapPageV2(browser, results) {
  const bucket = { console: [], pageerrors: [] };
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  logger(page, bucket);
  await login(page);
  await page.goto(`${BASE}/map?capture=${CAP}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('.maplibregl-canvas, canvas', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(4000);
  // Collect all tool-like elements with aria-label on the map chrome
  const tools = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('.maplibregl-ctrl button, [class*="chrome"] button, [data-testid*="tool"], button[aria-label], .maplibregl-popup'));
    const labels = nodes.map(n => n.getAttribute("aria-label") || n.getAttribute("title") || "").filter(Boolean);
    return [...new Set(labels)];
  });
  await page.screenshot({ path: `${OUT}/05b-map-page.png`, fullPage: false });
  results.push({ page: "Map page (v2)", metrics: { tool_count: tools.length, tool_labels: tools, console_errors: bucket.console.filter(c=>c.type==="error").length, console_warnings: bucket.console.filter(c=>c.type==="warning").length } });
  await ctx.close();
  return tools;
}

async function signaling(browser, results) {
  const bucket = { console: [], pageerrors: [] };
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  logger(page, bucket);
  await login(page);
  const t0 = Date.now();
  await page.goto(`${BASE}/signaling?capture=${CAP}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  // Timeline present
  const timeline = page.locator('[data-testid*="timeline"], [data-testid*="rf-timeline"], svg[aria-label*="imeline" i], svg[aria-label*="rise" i], .rf-timeline').first();
  await timeline.waitFor({ timeout: 15000 }).catch(()=>{});
  const t_timeline = Date.now();
  // Wait for events to render
  await page.waitForTimeout(5000);
  const t_done = Date.now();
  const tools = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('.maplibregl-ctrl button, [class*="chrome"] button, button[aria-label]'));
    return [...new Set(nodes.map(n => n.getAttribute("aria-label") || n.getAttribute("title") || "").filter(Boolean))];
  });
  const body = await page.locator('body').innerText().catch(()=>"");
  const unknown = (body.match(/Unknown/gi) || []).length;
  const rrcState = /RRC State|RRC Connected|RRC Idle/i.test(body);
  const ueState = /UE State|LTE Connected|LTE Idle/i.test(body);
  await page.screenshot({ path: `${OUT}/06b-signaling.png`, fullPage: false });
  results.push({ page: "Signaling (v2)", metrics: {
    nav_to_timeline_ms: t_timeline - t0,
    total_ms: t_done - t0,
    tool_count: tools.length, tool_labels: tools,
    unknown_hits: unknown, rrc_state_present: rrcState, ue_state_present: ueState,
    console_errors: bucket.console.filter(c => c.type === "error").length,
    console_warnings: bucket.console.filter(c => c.type === "warning").length,
  }});
  await ctx.close();
  writeFileSync(`${OUT}/signaling_v2_console.json`, JSON.stringify(bucket, null, 2));
  return tools;
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const results = [];
  let kpiMapTools = []; try { kpiMapTools = await kpiMap(browser, results); } catch (e) { results.push({ page: "KPI Map v2", error: e.message }); }
  let mapTools = []; try { mapTools = await mapPageV2(browser, results); } catch (e) { results.push({ page: "Map v2", error: e.message }); }
  let sigTools = []; try { sigTools = await signaling(browser, results); } catch (e) { results.push({ page: "Signaling v2", error: e.message }); }
  await browser.close();
  const comparison = {
    kpi_map_tools: kpiMapTools, map_page_tools: mapTools, signaling_tools: sigTools,
    kpi_vs_map_identical: JSON.stringify([...kpiMapTools].sort()) === JSON.stringify([...mapTools].sort()),
    kpi_vs_signaling_identical: JSON.stringify([...kpiMapTools].sort()) === JSON.stringify([...sigTools].sort()),
  };
  writeFileSync(`${OUT}/results_v2.json`, JSON.stringify({ results, comparison }, null, 2));
  console.log(JSON.stringify({ results, comparison }, null, 2));
})();
