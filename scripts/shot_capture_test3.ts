// Screenshot CAPTURE Phase 2 on project Test_3 (4b7bfd50ddb6) + capture 01bfc2fc5350.
// Produits :
//  - CAPTURE_test3_sidebar.png (arbre déplié avec feuilles actives n>0)
//  - CAPTURE_test3_table.png (table avec Log file name · Test script command name · Battery temperature)
//  - CAPTURE_test3_cpu_graph.png (graphe Device CPU temperature seul)
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const FRONT = process.env["BC4_FRONT_BASE"] ?? "http://localhost:5173";
const API = process.env["BC4_API_BASE"] ?? "http://localhost:8000";
const EMAIL = process.env["BC4_ADMIN_EMAIL"] ?? "admin@bc4.local";
const PASSWORD = process.env["BC4_ADMIN_PASSWORD"] ?? "ChangeMeAdmin123!";
const PROJECT_ID = "4b7bfd50ddb6";  // Test_3
const CAPTURE_ID = "01bfc2fc5350";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  await mkdir("artifacts", { recursive: true });

  // 1) Login UI
  await page.goto(`${FRONT}/login`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await page.getByRole("textbox", { name: /e-?mail/i }).fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /se connecter|login|sign in/i }).click();
  await page.waitForURL(/\/projects|\/kpi|\/$/, { timeout: 15_000 });
  await page.waitForTimeout(1_500);

  // 2) Open Test_3 via /projects page — find card by name, click its "Ouvrir".
  await page.goto(`${FRONT}/projects`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1_500);
  // The project list has multiple cards. Find the one containing "Test_3" (or Test3)
  // and click its sibling "Ouvrir" button.
  try {
    const projectCards = page.locator('[data-testid*="project"], article, [role="article"], .card');
    const n = await projectCards.count();
    let opened = false;
    for (let i = 0; i < n; i++) {
      const card = projectCards.nth(i);
      const text = (await card.innerText().catch(() => "")) ?? "";
      if (/Test_?3/i.test(text)) {
        const openBtn = card.locator('button:has-text("Ouvrir"), button:has-text("Open")').first();
        if (await openBtn.count()) {
          await openBtn.click({ timeout: 5_000 });
          opened = true;
          break;
        }
      }
    }
    if (!opened) {
      // Fallback : use the global search / fulltext click.
      const link = page.locator("text=/Test_?3/i").first();
      if (await link.count()) {
        const row = link.locator("xpath=ancestor::*[.//button][1]");
        const openBtn = row.locator('button:has-text("Ouvrir"), button:has-text("Open")').first();
        if (await openBtn.count()) await openBtn.click({ timeout: 3_000 });
        else await link.click({ timeout: 3_000 });
      }
    }
  } catch (e) { console.error("open Test_3 failed:", (e as Error).message); }
  await page.waitForTimeout(2_000);

  // 3) Navigate to KPI/Metrics
  await page.goto(`${FRONT}/kpi`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3_000);
  // Switch to Metrics catalogue tab
  try {
    await page.getByRole("tab", { name: /metrics catalogue/i }).first().click({ timeout: 5_000 });
    await page.waitForTimeout(1_500);
  } catch (e) { console.error("switch Metrics tab failed:", (e as Error).message); }

  // 4) Collapse LTE/NR if open
  for (const name of ["LTE", "NR"]) {
    try {
      const btn = page.locator(`button:has-text("${name}")`, { hasText: new RegExp(`^${name}$`) }).first();
      const expanded = await btn.getAttribute("aria-expanded");
      if (expanded === "true") await btn.click({ timeout: 2_000 });
    } catch {}
  }
  // Expand CAPTURE and 5 groups
  try {
    const captureRoot = page.locator('button:has-text("CAPTURE")').first();
    await captureRoot.click();
    await page.waitForTimeout(400);
    const all = page.locator('button:has-text("CAPTURE")');
    for (let i = 1; i < await all.count(); i++) {
      try { await all.nth(i).click({ timeout: 1_500 }); await page.waitForTimeout(100); } catch {}
    }
    for (const label of ["File", "Script", "Task", "Device", "Identity"]) {
      try {
        // Target the kpi-tree-family button (groups render as family in the tree).
        const btn = page.locator('button.kpi-tree-family', { hasText: new RegExp(`^${label}$`, "m") }).first();
        await btn.click({ timeout: 2_000 });
        await page.waitForTimeout(150);
      } catch (e) { console.error(`expand ${label} failed:`, (e as Error).message); }
    }
  } catch (e) { console.error("expand CAPTURE failed:", (e as Error).message); }
  await page.waitForTimeout(1_000);

  // 5) Screenshot the sidebar expanded
  const sidebar = page.locator('aside.kpi-catalog').first();
  if (await sidebar.count()) {
    try {
      await sidebar.screenshot({ path: "artifacts/CAPTURE_test3_sidebar.png" });
      console.log("saved artifacts/CAPTURE_test3_sidebar.png");
    } catch (e) { console.error("sidebar shot failed:", (e as Error).message); }
  }

  // 6) Click to select 3 CAPTURE leaves (Log file name + Test script command name + Battery temperature)
  for (const label of ["Log file name", "Test script command name", "Battery temperature"]) {
    try {
      // Leaves render inside .kpi-tree-leaf div with a button[type="button"].
      const leaf = page.locator('.kpi-tree-leaf button[type="button"]').filter({ hasText: new RegExp("^" + label.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&') + "\\s*$") }).first();
      await leaf.click({ timeout: 3_000 });
      await page.waitForTimeout(400);
    } catch (e) { console.error(`select ${label} failed:`, (e as Error).message); }
  }
  await page.waitForTimeout(3_000);

  // 7) Capture full page (table should render)
  await page.screenshot({ path: "artifacts/CAPTURE_test3_table.png", fullPage: true });
  console.log("saved artifacts/CAPTURE_test3_table.png");

  // 8) Deselect those, select only Device CPU temperature for the graph.
  for (const label of ["Log file name", "Test script command name", "Battery temperature"]) {
    try {
      const leaf = page.locator('.kpi-tree-leaf button[type="button"]').filter({ hasText: new RegExp("^" + label + "\\s*$") }).first();
      await leaf.click({ timeout: 2_000 });
      await page.waitForTimeout(200);
    } catch {}
  }
  try {
    const cpu = page.locator('.kpi-tree-leaf button[type="button"]').filter({ hasText: /^Device CPU temperature\s*$/ }).first();
    await cpu.click({ timeout: 3_000 });
    await page.waitForTimeout(3_000);
  } catch (e) { console.error("select CPU failed:", (e as Error).message); }
  await page.screenshot({ path: "artifacts/CAPTURE_test3_cpu_graph.png", fullPage: true });
  console.log("saved artifacts/CAPTURE_test3_cpu_graph.png");

  const report = { front: FRONT, api: API, projectId: PROJECT_ID, captureId: CAPTURE_ID,
                   catalogVersion: "2.53.0", version: "0.84.0" };
  await writeFile("artifacts/CAPTURE_test3_report.json", JSON.stringify(report, null, 2));
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
