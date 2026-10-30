import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
const OUT = "/home/devmat/BC4/audit/visual-20261030T2300Z";
const PW = readFileSync("/home/devmat/BC4/.secrets/admin_pw", "utf8").trim();
const BASE = "http://185.248.33.125:5174";
const PROJ = "43e81a34a073";
const EMAIL = "admin@bc4.local";

function logger(page, b) {
  page.on("console", (m) => b.console.push({ type: m.type(), text: m.text().slice(0, 300) }));
  page.on("pageerror", (e) => b.pageerrors.push(String(e).slice(0, 300)));
  page.on("response", (r) => {
    const u = r.url();
    if (/\/sites\?|\/metrics\/map/.test(u)) {
      b.requests.push({ url: u.replace(BASE, ""), status: r.status() });
    }
  });
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[name="username"]', { timeout: 20000 });
  await page.fill('input[name="username"]', EMAIL);
  await page.fill('input[name="password"]', PW);
  await page.locator('form button:has-text("Se connecter")').click();
  await page.waitForURL(/\/(projects|change-password|kpi|map|signaling)/, { timeout: 20000 });
  await page.evaluate(({ p, e }) => localStorage.setItem(`bc4.activeProject.v1.${e}`, JSON.stringify({ id: p, name: "Test_6" })), { p: PROJ, e: EMAIL });
}

async function captureAtZoom(page, zoom, label) {
  await page.evaluate((z) => {
    // Try to access the maplibre map instance and set zoom
    const canvases = document.querySelectorAll(".maplibregl-canvas");
    for (const c of canvases) {
      const map = c.parentElement?._map || c.__map;
      if (map && typeof map.setZoom === "function") { map.setZoom(z); return "set"; }
    }
    // fallback via mapboxgl/maplibregl global
    if (window.__mapInstance?.setZoom) { window.__mapInstance.setZoom(z); return "fallback"; }
    return "none";
  }, zoom);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/${label}-zoom${zoom}.png`, fullPage: false });
}

async function pageProbe(browser, routePath, label, capture) {
  const b = { console: [], pageerrors: [], requests: [] };
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  logger(page, b);
  try { await login(page); } catch (e) { b.login_err = e.message; }
  const url = `${BASE}/${routePath}?capture=${capture}`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  // Wait for maplibre to be ready
  await page.waitForSelector(".maplibregl-canvas, canvas", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);
  for (const z of [11, 13, 15, 16]) {
    b.requests = []; // reset per zoom
    try { await captureAtZoom(page, z, `${label}-${capture}`); } catch (e) { b[`err_z${z}`] = e.message; }
    // After zoom, save per-zoom request snapshot
    b[`z${z}_requests`] = [...b.requests];
    // Count sites features in DOM (maplibre renders as SVG/canvas, hard to count, use network only)
  }
  // Final screenshot
  await page.screenshot({ path: `${OUT}/${label}-${capture}-final.png`, fullPage: false });
  await ctx.close();
  return b;
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const results = {};
  for (const [path, label] of [["map", "map"], ["signaling", "signaling"], ["kpi", "kpi"]]) {
    for (const cap of ["ecffb18dbd7f", "a4b0c321c52e"]) {
      const key = `${label}-${cap}`;
      try {
        results[key] = await pageProbe(browser, path, label, cap);
      } catch (e) {
        results[key] = { fatal: e.message };
      }
    }
  }
  await browser.close();
  writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
  // Print condensed summary
  for (const k of Object.keys(results)) {
    const r = results[k];
    console.log(`\n== ${k} ==`);
    for (const z of [11,13,15,16]) {
      const rq = r[`z${z}_requests`] || [];
      const sitesCalls = rq.filter(x => /\/sites/.test(x.url));
      console.log(`  z=${z}: ${sitesCalls.length} /sites calls, statuses=${sitesCalls.map(x=>x.status).join(",")}`);
      if (sitesCalls.length) {
        for (const c of sitesCalls.slice(0,2)) console.log(`     ${c.url.slice(0,140)}`);
      }
    }
    const errs = (r.console || []).filter(c => c.type === "error");
    console.log(`  console_errors=${errs.length}, pageerrors=${(r.pageerrors||[]).length}`);
  }
})();
