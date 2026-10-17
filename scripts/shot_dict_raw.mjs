// Garde 1.21.2 : parcours utilisateur réel REF sur :5174 pour vérifier
// l'onglet Raw. Attendu :
//  - Raw › LTE › RRCConnectionSetup : phr-Config + dl-PathlossChange
//    visibles avec compte agrégé, sans "/" ni "[0]" dans la ligne.
//  - Raw › LTE › MeasurementReport : rsrpResult / rsrqResult /
//    physCellId une seule ligne chacun.
//  - Aucun "/" ni "[0]" dans AUCUNE ligne du Raw tree.
//  - Tooltip (title=) = chemin ASN.1 complet.
import { chromium } from "playwright";
import * as fs from "node:fs";

const FRONT = process.env.FRONT || "http://localhost:5174";
const API = process.env.API || "http://localhost:8000";
const EMAIL = "admin@bc4.local";
const PASSWORD = "ChangeMeAdmin123!";
const PROJECT = "REF_PETITE_FORET";
const OUT = "/tmp/bc4-dict-raw";
fs.mkdirSync(OUT, { recursive: true });

async function login() {
  const r = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const d = await r.json();
  return d.token;
}

const token = await login();
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
const page = await ctx.newPage();
const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() !== "error") return;
  const t = m.text();
  if (t.includes("ERR_NETWORK_CHANGED")) return;
  consoleErrors.push(t);
});
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

await page.addInitScript((tok) => {
  const sess = {
    token: tok,
    token_type: "Bearer",
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
    user: { id: "adm-30bf55313911", email: "admin@bc4.local", role: "admin", active: true, created_at: "2026-10-15T14:22:08Z" },
  };
  window.localStorage.setItem("bc4.session", JSON.stringify(sess));
}, token);

await page.goto(`${FRONT}/projects`, { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(600);
await page.locator("tr", { hasText: PROJECT }).first().locator("button", { hasText: "Ouvrir" }).first().click();
await page.waitForTimeout(400);
await page.locator("nav a", { hasText: "Dictionnaire RRC" }).first().click();
await page.waitForSelector('[data-testid="dict-tree-tabs"]', { timeout: 25000 });
await page.waitForTimeout(1500);

// Switch to Raw tab
await page.locator('[data-testid="dict-tree-tabs"] button').nth(1).click();
await page.waitForTimeout(800);

// Record subtitle (n paramètres · n détections)
const subtitle = await page.evaluate(() => {
  const txts = Array.from(document.querySelectorAll("p"))
    .map((p) => p.textContent?.trim() ?? "")
    .filter((t) => /paramètres · .* lignes/.test(t));
  return txts[0] ?? null;
});

// Expand LTE (should be open by default)
// Click RRCConnectionSetup
await page.locator('[role="treeitem"]', { hasText: /^RRCConnectionSetup/ }).first().click({ force: true });
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/dict_raw_rrcconnectionsetup.png`, fullPage: true });

// Check content for RRCConnectionSetup leaves
const rrcSetupLeaves = await page.evaluate(() => {
  // Find expanded RRCConnectionSetup message and grab its leaf rows
  const msgBtn = Array.from(document.querySelectorAll('[role="treeitem"]'))
    .find((b) => (b.textContent ?? "").startsWith("RRCConnectionSetup"));
  if (!msgBtn) return null;
  const parentLi = msgBtn.closest("li");
  if (!parentLi) return null;
  // Leaf rows have data-testid="dict-raw-leaf-<name>"
  const rows = Array.from(parentLi.querySelectorAll('[data-testid^="dict-raw-leaf-"]'));
  return rows.map((r) => ({
    display: (r.querySelector("span")?.textContent ?? "").trim(),
    tooltip: r.querySelector("span")?.getAttribute("title") ?? "",
    containsSlash: (r.querySelector("span")?.textContent ?? "").includes("/"),
    containsBracket: /\[\d+\]/.test(r.querySelector("span")?.textContent ?? ""),
  }));
});

// Close RRCConnectionSetup, open MeasurementReport
await page.locator('[role="treeitem"]', { hasText: /^RRCConnectionSetup/ }).first().click({ force: true });
await page.waitForTimeout(200);
const mrBtn = page.locator('[role="treeitem"]', { hasText: /^MeasurementReport/ }).first();
if ((await mrBtn.count()) > 0) {
  await mrBtn.click({ force: true });
  await page.waitForTimeout(500);
}
await page.screenshot({ path: `${OUT}/dict_raw_measurementreport.png`, fullPage: true });

const mrLeaves = await page.evaluate(() => {
  const msgBtn = Array.from(document.querySelectorAll('[role="treeitem"]'))
    .find((b) => (b.textContent ?? "").startsWith("MeasurementReport"));
  if (!msgBtn) return null;
  const parentLi = msgBtn.closest("li");
  if (!parentLi) return null;
  const rows = Array.from(parentLi.querySelectorAll('[data-testid^="dict-raw-leaf-"]'));
  return rows.map((r) => ({
    display: (r.querySelector("span")?.textContent ?? "").trim(),
    tooltip: r.querySelector("span")?.getAttribute("title") ?? "",
    containsSlash: (r.querySelector("span")?.textContent ?? "").includes("/"),
    containsBracket: /\[\d+\]/.test(r.querySelector("span")?.textContent ?? ""),
  }));
});

// Scan ALL raw tree rows: no "/" and no "[0]"
const allRawRowsCheck = await page.evaluate(() => {
  const rows = Array.from(document.querySelectorAll('[data-testid^="dict-raw-leaf-"]'));
  const bad = rows
    .map((r) => (r.querySelector("span")?.textContent ?? "").trim())
    .filter((t) => t.includes("/") || /\[\d+\]/.test(t));
  return { total: rows.length, bad };
});

const report = {
  version: "1.21.2",
  project: PROJECT,
  subtitle,
  rrcSetupLeaves,
  mrLeaves,
  allRawRowsCheck,
  consoleErrors,
};
fs.writeFileSync(`${OUT}/dict_raw_report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2).substring(0, 3000));

if (allRawRowsCheck.bad.length > 0) {
  console.error("FAILED: lignes avec / ou [0]:", allRawRowsCheck.bad.slice(0, 10));
  process.exitCode = 2;
}
if (consoleErrors.length > 0) process.exitCode = 2;

await browser.close();
