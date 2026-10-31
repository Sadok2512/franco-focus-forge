import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";

const OUT = "/home/devmat/BC4/audit/popup-20261031T0045Z";
const PW = readFileSync("/home/devmat/BC4/.secrets/admin_pw", "utf8").trim();
const BASE = "http://185.248.33.125:5174";

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[name="username"]', { timeout: 20000 });
  await page.fill('input[name="username"]', "admin@bc4.local");
  await page.fill('input[name="password"]', PW);
  await page.locator('form button:has-text("Se connecter")').click();
  await page.waitForURL(/\/(projects|change-password|kpi|map|signaling)/, { timeout: 20000 });
  await page.evaluate(() => localStorage.setItem('bc4.activeProject.v1.admin@bc4.local', JSON.stringify({ id: "43e81a34a073", name: "Test_6" })));
}

async function openMap(page, cap) {
  await page.goto(`${BASE}/map?capture=${cap}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".maplibregl-canvas", { timeout: 25000 });
  await page.waitForTimeout(6000);
}

async function clickFirstPoint(page) {
  const canvas = await page.locator(".maplibregl-canvas").first();
  const box = await canvas.boundingBox();
  if (!box) return { ok: false, reason: "no-canvas" };
  // Try several center-ish spots to find a point
  const tries = [
    [box.width/2, box.height/2],
    [box.width*0.45, box.height*0.55],
    [box.width*0.55, box.height*0.45],
    [box.width*0.5, box.height*0.6],
    [box.width*0.4, box.height*0.5],
  ];
  for (const [dx, dy] of tries) {
    await page.mouse.click(box.x + dx, box.y + dy);
    await page.waitForTimeout(900);
    const popup = await page.locator(".maplibregl-popup-content, [role=dialog], [data-testid*=popup]").first();
    const visible = await popup.isVisible().catch(()=>false);
    if (visible) {
      const text = await popup.innerText().catch(()=>"");
      if (/dBm|serving|PCI|EARFCN|Serving/i.test(text)) {
        return { ok: true, text, click: [dx,dy] };
      }
    }
  }
  return { ok: false, reason: "no-popup-at-tries" };
}

async function probe(browser, cap) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", m => { if (m.type()==="error") errs.push(m.text().slice(0,200)); });
  await login(page);
  await openMap(page, cap);
  // Screenshot of full map before interactions
  await page.screenshot({ path: `${OUT}/map-${cap}-initial.png`, fullPage: false });
  // Look for toggles (Serving / Voisines / NR)
  const bodyText = await page.locator("body").innerText().catch(()=>"");
  const toggles = {
    serving: /Serving|serving/i.test(bodyText),
    neighbour: /Voisin|Neighbour|neighbour/i.test(bodyText),
    nr: /\bNR\b|ancre NR|NR anchor/i.test(bodyText),
  };
  const legend = /proven|probable|Solid|Dashed|plein|pointill/i.test(bodyText);
  const click = await clickFirstPoint(page);
  if (click.ok) {
    await page.screenshot({ path: `${OUT}/map-${cap}-popup.png`, fullPage: false });
  } else {
    await page.screenshot({ path: `${OUT}/map-${cap}-nopopup.png`, fullPage: false });
  }
  // Attempt to inspect SVG line styles via map layers (dash-array in paint)
  // Playwright inside page: enumerate the maplibre style
  const linePaints = await page.evaluate(() => {
    try {
      // The map instance is attached by some apps to window; find it
      const containers = document.querySelectorAll(".maplibregl-map");
      // Fallback via window.__maplibregl__ or app helper if any — else via computed style
      // We cannot easily reach map object; instead sample the SVG/canvas by DOM look.
      const paths = Array.from(document.querySelectorAll("svg path, canvas"));
      return { pathCount: paths.length };
    } catch (e) { return { err: String(e) }; }
  });
  await ctx.close();
  return { cap, toggles, legend, click: { ok: click.ok, text: (click.text||"").slice(0, 400), reason: click.reason }, errs, linePaints };
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const out = {};
  for (const cap of ["a4b0c321c52e", "ecffb18dbd7f"]) {
    try { out[cap] = await probe(browser, cap); } catch (e) { out[cap] = { error: e.message }; }
  }
  await browser.close();
  writeFileSync(`${OUT}/results.json`, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
})();
