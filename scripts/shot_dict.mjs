// Playwright capture (JS, pour éviter le besoin de tsx). Mêmes étapes que
// le .ts : login → /rrc → cocher 3 feuilles sous A3 → "Les deux" → search
// "drx" → Raw tab + search rrc-TransactionIdentifier → 3 PNG + log.
import { chromium } from "playwright";
import * as fs from "node:fs";

const BASE = process.env.BASE || "http://localhost:5175";
const PROJECT_ID = "7e656b8c6c19";
const EMAIL = "admin@bc4.local";
const PASSWORD = "ChangeMeAdmin123!";
const OUT_DIR = "/home/devmat/BC4/bc4-front-dict/artifacts";

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const consoleErrors = [];
let report_extras = {};
page.on("console", (m) => {
  if (m.type() !== "error") return;
  const t = m.text();
  // Filtre : ERR_NETWORK_CHANGED = quirk Chrome Playwright (bascule
  // d'interface réseau pendant le launch), ne vient pas de l'app.
  if (t.includes("ERR_NETWORK_CHANGED")) return;
  consoleErrors.push(t);
});
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill('input[autocomplete="email"]', EMAIL);
await page.fill('input[autocomplete="current-password"]', PASSWORD);
await page.getByRole("button", { name: /Se connecter/i }).click();
await page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 15000 });

await page.goto(`${BASE}/rrc?project=${PROJECT_ID}`, { waitUntil: "networkidle" });
await page.waitForSelector('[data-testid="dict-tree-tabs"]', { timeout: 25000 });
await page.waitForTimeout(1500); // laisser le fetch tree finir

const tabs = page.locator('[data-testid="dict-tree-tabs"] button');
const tabsCount = await tabs.count();
if (tabsCount < 2) throw new Error(`Expected 2 tabs, got ${tabsCount}`);

// Expand the subtree where A3 leaves live for a nice "déplié" screenshot
await page
  .locator('[role="treeitem"]', { hasText: "RRCConnectionReconfiguration" })
  .first()
  .click({ force: true })
  .catch(() => {});
await page.waitForTimeout(200);

for (const name of ["a3-Offset", "hysteresis", "timeToTrigger"]) {
  const search = page.locator('[data-testid="dict-tree-search"]');
  await search.fill(name);
  await page.waitForTimeout(500);
  const row = page.locator(`[data-testid="dict-leaf-${name}"]`).first();
  const cb = row.locator('input[type="checkbox"]');
  await cb.check();
  await page.waitForTimeout(200);
}
await page.locator('[data-testid="dict-tree-search"]').fill("");
await page.waitForTimeout(300);

// Attendre que les 3 cartes de distribution ValueExplorer soient là.
await page.waitForSelector('[data-testid="dict-value-explorer"]', { timeout: 20000 });
await page.waitForTimeout(2000);
await page.screenshot({ path: `${OUT_DIR}/dict_a3_operator.png`, fullPage: true });

await page.locator('[data-testid="dict-groupby-operator_band"]').click();
await page.waitForTimeout(2000);
await page.screenshot({ path: `${OUT_DIR}/dict_a3_operator_band.png`, fullPage: true });

await page.locator('[data-testid="dict-tree-search"]').fill("drx");
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT_DIR}/dict_search_drx.png`, fullPage: true });

const rawTab = page.locator('[data-testid="dict-tree-tabs"] button').nth(1);
await rawTab.click();
await page.waitForTimeout(800);
await page.locator('[data-testid="dict-tree-search"]').fill("rrc-TransactionIdentifier");
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT_DIR}/dict_raw_rrc_tx.png`, fullPage: true });
// Count leaf buttons containing rrc-TransactionIdentifier (text match
// évite le pb des data-testid avec slashes dans view=raw).
const rawHits = await page
  .locator('[role="tree"] button', { hasText: /rrc-TransactionIdentifier/i })
  .count();

// Catalog tab + search rrc-TransactionIdentifier should produce 0 hits
await page.locator('[data-testid="dict-tree-tabs"] button').nth(0).click();
await page.waitForTimeout(500);
await page.locator('[data-testid="dict-tree-search"]').fill("rrc-TransactionIdentifier");
await page.waitForTimeout(800);
const catalogHits = await page
  .locator('[role="tree"] button', { hasText: /rrc-TransactionIdentifier/i })
  .count();

// Capture d'un arbre déplié sur LTE › Configuration réseau ›
// RRCConnectionReconfiguration › MAC-DRX comme demandé.
await page.locator('[data-testid="dict-tree-search"]').fill("");
await page.waitForTimeout(300);
// Développe origin "Configuration réseau" + message RRCConnectionReconfiguration
await page
  .locator('[role="treeitem"]', { hasText: "Configuration réseau" })
  .first()
  .click({ force: true })
  .catch(() => {});
await page.waitForTimeout(200);
await page
  .locator('[role="treeitem"]', { hasText: "RRCConnectionReconfiguration" })
  .first()
  .click({ force: true })
  .catch(() => {});
await page.waitForTimeout(200);
await page
  .locator('[role="treeitem"]', { hasText: /MAC.*DRX/i })
  .first()
  .click({ force: true })
  .catch(() => {});
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT_DIR}/dict_tree_mac_drx.png`, fullPage: true });

// Garde Réinitialiser : cocher 3 feuilles, saisir du texte dans search,
// déplier des nœuds, puis cliquer Réinitialiser → tout doit revenir à
// l'état initial (compteur=0, search vide, panneau droit vide).
await page.locator('[data-testid="dict-tree-tabs"] button').nth(0).click();
await page.waitForTimeout(400);
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
await page.locator('[data-testid="dict-tree-search"]').fill("test-pre-reset");
await page.waitForTimeout(300);
const nSelBefore = await page.locator('[data-testid="dict-selected-count"] b').textContent();
await page.screenshot({ path: `${OUT_DIR}/dict_before_reset.png`, fullPage: true });
await page.locator('[data-testid="dict-reset"]').click();
await page.waitForTimeout(500);
const nSelAfter = await page.locator('[data-testid="dict-selected-count"] b').textContent();
const searchAfter = await page.locator('[data-testid="dict-tree-search"]').inputValue();
await page.screenshot({ path: `${OUT_DIR}/dict_after_reset.png`, fullPage: true });

// Add to report
report_extras = { nSelBefore, nSelAfter, searchAfter };

const report = { base: BASE, project: PROJECT_ID, tabs: tabsCount, rawTxFound: rawHits, catalogTxFound: catalogHits, ...report_extras, consoleErrors };
fs.writeFileSync(`${OUT_DIR}/dict_report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

if (consoleErrors.length > 0) {
  console.error("CONSOLE ERRORS:", consoleErrors);
  process.exitCode = 2;
}

await browser.close();
