// Garde v1.18.0 : parcours utilisateur réel sur :5174.
// 1. /login UI (token injecté localStorage)
// 2. /projects → click « Ouvrir » sur REF_PETITE_FORET
// 3. click « Dictionnaire RRC » dans la nav
// 4. onglets Paramètres | Raw, cocher a3-Offset + hysteresis + timeToTrigger
// 5. click Réinitialiser → compteur 0, panneau droit = EmptyState
// 6. onglet Raw : arbre identique à l'ancien front (rrc-TransactionIdentifier
//    présent)
// 7. nav → KPI Analytics : garde 5 actifs / 6 gris reste identique
// 8. version "BC4 v1.18.0" présente en pied du login OU dans AppShell
import { chromium } from "playwright";
import * as fs from "node:fs";

const FRONT = process.env.FRONT || "http://localhost:5174";
const API = process.env.API || "http://localhost:8000";
const EMAIL = "admin@bc4.local";
const PASSWORD = "ChangeMeAdmin123!";
const PROJECT = "REF_PETITE_FORET";
const OUT = "/tmp/bc4-dict-main";
fs.mkdirSync(OUT, { recursive: true });

async function login() {
  const r = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const d = await r.json();
  if (!d.token) throw new Error("no token");
  return d.token;
}

const token = await login();
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() !== "error") return;
  const t = m.text();
  if (t.includes("ERR_NETWORK_CHANGED")) return;
  consoleErrors.push(t);
});
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

// Session injectée
await page.addInitScript((tok) => {
  const sess = {
    token: tok,
    token_type: "Bearer",
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
    user: { id: "adm-30bf55313911", email: "admin@bc4.local", role: "admin", active: true, created_at: "2026-10-15T14:22:08Z" },
  };
  window.localStorage.setItem("bc4.session", JSON.stringify(sess));
}, token);

// 1. /projects → click Ouvrir
await page.goto(`${FRONT}/projects`, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(600);
const row = page.locator("tr", { hasText: PROJECT }).first();
if ((await row.count()) === 0) throw new Error(`project row ${PROJECT} not found`);
await row.locator("button", { hasText: "Ouvrir" }).first().click();
await page.waitForTimeout(400);

// 2. Click Dictionnaire RRC
await page.locator("nav a", { hasText: "Dictionnaire RRC" }).first().click();
await page.waitForSelector('[data-testid="dict-tree-tabs"]', { timeout: 25000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/dict_main_landing.png`, fullPage: true });

// 3. tabs
const tabs = page.locator('[data-testid="dict-tree-tabs"] button');
const tabsCount = await tabs.count();
if (tabsCount < 2) throw new Error(`Expected 2 tabs, got ${tabsCount}`);

// 4. cocher 3 feuilles
for (const name of ["a3-Offset", "hysteresis", "timeToTrigger"]) {
  await page.locator('[data-testid="dict-tree-search"]').fill(name);
  await page.waitForTimeout(400);
  await page
    .locator(`[data-testid="dict-leaf-${name}"]`)
    .first()
    .locator('input[type="checkbox"]')
    .check();
  await page.waitForTimeout(200);
}
await page.locator('[data-testid="dict-tree-search"]').fill("");
await page.waitForTimeout(500);
await page.waitForSelector('[data-testid="dict-value-explorer"]', { timeout: 20000 });
// Attend que les 3 ECharts soient rendus (canvas prêts).
await page.waitForFunction(
  () => document.querySelectorAll('[data-testid^="dict-chart-"] canvas').length >= 3,
  undefined,
  { timeout: 20000 },
).catch(() => {});
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/dict_main_a3_charts.png`, fullPage: true });
const nSelLive = await page.locator('[data-testid="dict-selected-count"] b').textContent();

// 5. Réinitialiser
await page.locator('[data-testid="dict-reset"]').click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/dict_main_after_reset.png`, fullPage: true });
const nSelAfter = await page.locator('[data-testid="dict-selected-count"] b').textContent();
const searchAfter = await page.locator('[data-testid="dict-tree-search"]').inputValue();

// 6. onglet Raw + search rrc-TransactionIdentifier
await page.locator('[data-testid="dict-tree-tabs"] button').nth(1).click();
await page.waitForTimeout(500);
await page.locator('[data-testid="dict-tree-search"]').fill("rrc-TransactionIdentifier");
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/dict_main_raw.png`, fullPage: true });
const rawHits = await page
  .locator('[role="tree"] button', { hasText: /rrc-TransactionIdentifier/i })
  .count();

// 7. Navigation KPI (5 actifs / 6 gris reste la propriété de /kpi)
await page.locator('[data-testid="dict-tree-tabs"] button').nth(0).click();
await page.waitForTimeout(200);
await page.locator("nav a", { hasText: "KPI Analytics" }).first().click();
await page
  .waitForFunction(
    () => {
      const panels = Array.from(document.querySelectorAll("div.panel"));
      return panels.some((p) => p.textContent?.includes("Filtres"));
    },
    undefined,
    { timeout: 30000 },
  )
  .catch(() => {});
await page.waitForTimeout(1500);
const kpiCounts = await page.evaluate(() => {
  const panels = Array.from(document.querySelectorAll("div.panel"));
  const bar = panels.find((p) => p.textContent?.includes("Filtres"));
  if (!bar) return { bar: false, active: 0, gray: 0 };
  const active = bar.querySelectorAll("button[aria-haspopup=listbox]").length;
  const directSpans = Array.from(bar.querySelectorAll(":scope > span"));
  const gray = directSpans.filter((s) => (s.className ?? "").includes("border-dashed")).length;
  return { bar: true, active, gray };
});
await page.screenshot({ path: `${OUT}/dict_main_kpi.png`, fullPage: true });

// 8. Version badge — cherche "v1.18.0" dans le login footer (recharge
// /login dans un onglet off) OU dans l'AppShell header.
const versionInUI = await page.evaluate(() => {
  const body = document.body.textContent ?? "";
  return /v?1\.18\.0/.test(body) ? "1.18.0" : null;
});

const report = {
  front: FRONT,
  project: PROJECT,
  tabs: tabsCount,
  nSelLive,
  nSelAfter,
  searchAfter,
  rawHits,
  kpiCounts,
  versionInUI,
  consoleErrors,
};
fs.writeFileSync(`${OUT}/dict_main_report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

if (consoleErrors.length > 0) process.exitCode = 2;
await browser.close();
