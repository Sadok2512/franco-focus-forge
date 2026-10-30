import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";

const OUT = "/home/devmat/BC4/audit/visual-20261030T2015Z";
const PW = readFileSync("/home/devmat/BC4/.secrets/admin_pw", "utf8").trim();
const BASE = "http://127.0.0.1:5174";
const PROJ = "43e81a34a073";
const CAP = "a4b0c321c52e";
const EMAIL = "admin@bc4.local";

const bucketFactory = () => ({ console: [], pageerrors: [] });
function logger(page, b) {
  page.on("console", (m) => b.console.push({ type: m.type(), text: m.text().slice(0, 300) }));
  page.on("pageerror", (e) => b.pageerrors.push(String(e).slice(0, 300)));
}
async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[name="username"]', { timeout: 15000 });
  await page.fill('input[name="username"]', EMAIL);
  await page.fill('input[name="password"]', PW);
  await page.locator('form button:has-text("Se connecter")').click();
  await page.waitForURL(/\/(projects|change-password|kpi|map|signaling)/, { timeout: 15000 });
  await page.evaluate(({ p, e }) => localStorage.setItem(`bc4.activeProject.v1.${e}`, JSON.stringify({ id: p, name: "Test_6" })), { p: PROJ, e: EMAIL });
}
function nonChromiumWebGL(b) {
  // Filter out ChromeHeadless-induced WebGL warnings
  return b.console.filter(c => c.type === "warning" && !/WebGL|GPU/i.test(c.text));
}

async function kpiTabs(browser, R) {
  const b = bucketFactory();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage(); logger(page, b);
  await login(page);
  await page.goto(`${BASE}/kpi?capture=${CAP}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  // Metrics tab (default or click)
  await page.locator('[role="tab"]:has-text("Metrics"), button:has-text("Metrics")').first().click().catch(()=>{});
  await page.waitForTimeout(2500);
  const panelsM = await page.locator('[data-testid*="metrics-catalog"], [data-testid*="metrics-sidebar"]').count();
  const searchM = await page.locator('input[type="search"], input[placeholder*="echerch" i], input[placeholder*="earch" i]').count();
  const showUnavail = (await page.getByText(/show unavailable|afficher les non.disponibles/i).count()) > 0;
  const activeOnly = (await page.getByText(/active only|actifs uniquement/i).count()) > 0;
  const noMatch = await page.getByText(/No KPIs match this search/i).count();
  await page.screenshot({ path: `${OUT}/01-metrics.png` });
  R.push({ page: "KPI · Metrics", metrics: { panels: panelsM, search_fields: searchM, show_unavailable: showUnavail, active_only: activeOnly, no_match_block: noMatch, console_errors: b.console.filter(c=>c.type==="error").length, console_warnings_non_webgl: nonChromiumWebGL(b).length } });

  // KPI tab
  await page.locator('[role="tab"]:has-text("KPI"), button:has-text("KPI")').first().click().catch(()=>{});
  await page.waitForTimeout(2500);
  // Count visible KPI leaves (dot-prefixed items)
  const bodyText = await page.locator('body').innerText().catch(()=>"");
  const kpiTabCount = (bodyText.match(/\bKPI\s*·?\s*\d+/g) || []).join(", ");
  // Expand all KPI families
  const expandables = page.locator('aside button, [data-testid*="kpi-family"]');
  const nFam = await expandables.count();
  for (let i = 0; i < Math.min(nFam, 20); i++) {
    try { await expandables.nth(i).click({ timeout: 500 }); } catch {}
  }
  await page.waitForTimeout(1000);
  const kpiLeafCount = await page.locator('aside li, aside [data-testid*="kpi"]').count();
  // Pattern "N available"
  const availMatch = bodyText.match(/(\d+)\s*·?\s*(?:AVAIL|disponibles?)/gi);
  await page.screenshot({ path: `${OUT}/02-kpi.png` });
  R.push({ page: "KPI tab", metrics: { kpi_tab_counts_text: kpiTabCount, availability_bits: availMatch?.slice(0,10), li_total: kpiLeafCount, console_errors: b.console.filter(c=>c.type==="error").length, console_warnings_non_webgl: nonChromiumWebGL(b).length } });

  // Parameters tab
  await page.locator('[role="tab"]:has-text("Parameters"), button:has-text("Parameters")').first().click().catch(()=>{});
  await page.waitForTimeout(3500);
  // Open the first PHY leaf
  const phy = page.getByText(/^PHY\b/i).first();
  if (await phy.count()) await phy.click();
  await page.waitForTimeout(1500);
  // Check "PHY · N paramètre"
  const paramMatch = (await page.locator('body').innerText().catch(()=>"")).match(/PHY\s*·\s*\d+\s*paramètres?/i);
  const stuck = /Chargement/i.test(await page.locator('body').innerText().catch(()=>""));
  await page.screenshot({ path: `${OUT}/03-parameters.png` });
  R.push({ page: "Parameters tab", metrics: { stuck_on_chargement: stuck, phy_param_label: paramMatch ? paramMatch[0] : null, console_errors: b.console.filter(c=>c.type==="error").length, console_warnings_non_webgl: nonChromiumWebGL(b).length } });

  await ctx.close();
}

async function captureMap(browser, R) {
  const b = bucketFactory();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage(); logger(page, b);
  await login(page);
  await page.goto(`${BASE}/map?capture=${CAP}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('.maplibregl-canvas, canvas', { timeout: 15000 }).catch(()=>{});
  await page.waitForTimeout(5000);
  const tools = await page.evaluate(() => {
    const n = Array.from(document.querySelectorAll('.maplibregl-ctrl button, button[aria-label], [data-testid*="tool"]'));
    return [...new Set(n.map(x => x.getAttribute("aria-label") || x.getAttribute("title") || "").filter(Boolean))];
  });
  await page.screenshot({ path: `${OUT}/04-map.png` });
  R.push({ page: "Map page", metrics: { tool_count: tools.length, tool_labels: tools, console_errors: b.console.filter(c=>c.type==="error").length, console_warnings_non_webgl: nonChromiumWebGL(b).length } });
  await ctx.close();
  return tools;
}

async function captureSignaling(browser, R) {
  const b = bucketFactory();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage(); logger(page, b);
  await login(page);
  const t0 = Date.now();
  await page.goto(`${BASE}/signaling?capture=${CAP}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  const tTot = Date.now() - t0;
  const tools = await page.evaluate(() => {
    const n = Array.from(document.querySelectorAll('.maplibregl-ctrl button, button[aria-label], [data-testid*="tool"]'));
    return [...new Set(n.map(x => x.getAttribute("aria-label") || x.getAttribute("title") || "").filter(Boolean))];
  });
  const body = await page.locator('body').innerText().catch(()=>"");
  const unk = (body.match(/Unknown/gi) || []).length;
  const rrc = /RRC State|RRC Connected|RRC Idle/i.test(body);
  const ue = /UE State|LTE Connected|LTE Idle/i.test(body);
  await page.screenshot({ path: `${OUT}/05-signaling.png` });
  R.push({ page: "Signaling", metrics: { total_ms: tTot, tool_count: tools.length, tool_labels: tools, unknown_hits: unk, rrc_state: rrc, ue_state: ue, console_errors: b.console.filter(c=>c.type==="error").length, console_warnings_non_webgl: nonChromiumWebGL(b).length } });
  await ctx.close();
  return tools;
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const R = [];
  try { await kpiTabs(browser, R); } catch (e) { R.push({ page: "KPI tabs", error: e.message }); }
  let mt = []; try { mt = await captureMap(browser, R); } catch (e) { R.push({ page: "Map", error: e.message }); }
  let st = []; try { st = await captureSignaling(browser, R); } catch (e) { R.push({ page: "Signaling", error: e.message }); }
  await browser.close();
  const comp = { map_tools: mt, signaling_tools: st, intersection: mt.filter(t => st.includes(t)), map_only: mt.filter(t => !st.includes(t)), signaling_only: st.filter(t => !mt.includes(t)) };
  writeFileSync(`${OUT}/results.json`, JSON.stringify({ R, comp }, null, 2));
  console.log(JSON.stringify({ R, comp }, null, 2));
})();
