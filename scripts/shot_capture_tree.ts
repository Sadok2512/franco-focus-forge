// bun run scripts/shot_capture_tree.ts
// Screenshot CAPTURE tree expanded + LTE/NR tech labels (Catalog 2.52.0).
// Preuve lot BC3 0.83.0 / 1.110.0.

import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const FRONT = process.env["BC4_FRONT_BASE"] ?? "http://localhost:5173";
const API = process.env["BC4_API_BASE"] ?? "http://localhost:8000";
const EMAIL = process.env["BC4_ADMIN_EMAIL"] ?? "admin@bc4.local";
const PASSWORD = process.env["BC4_ADMIN_PASSWORD"] ?? "ChangeMeAdmin123!";
const PROJECT_ID = process.env["BC4_SHOT_PROJECT_ID"] ?? "4b7bfd50ddb6"; // Test_3

async function login(): Promise<string> {
  const r = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!r.ok) throw new Error(`login ${r.status}`);
  const d = (await r.json()) as { token?: string };
  if (!d.token) throw new Error("no token");
  return d.token;
}

async function main() {
  const token = await login();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  await context.addInitScript((args) => {
    const [t, p] = args as [string, string];
    localStorage.setItem("bc4_token", t);
    localStorage.setItem("activeProjectId", p);
    localStorage.setItem("activeProject", JSON.stringify({ id: p, name: "Test_3" }));
  }, [token, PROJECT_ID]);

  const page = await context.newPage();
  const ts = Date.now();

  // 1) Login via UI (production front doesn't trust bare localStorage).
  await page.goto(`${FRONT}/login`, { waitUntil: "networkidle", timeout: 30_000 });
  await page.waitForTimeout(500);
  try {
    await page.getByRole("textbox", { name: /e-?mail/i }).fill(EMAIL);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole("button", { name: /se connecter|login|sign in/i }).click();
    await page.waitForURL(/\/projects|\/kpi|\/$/, { timeout: 15_000 });
  } catch (e) {
    console.error("login UI failed:", (e as Error).message);
  }
  await page.waitForTimeout(1_500);

  // 2) Open a project via /projects page UI → click "Ouvrir" on Test_3
  await page.goto(`${FRONT}/projects`, { waitUntil: "networkidle", timeout: 30_000 });
  await page.waitForTimeout(1_000);
  try {
    // Click "Ouvrir" button next to Test_3
    const openBtn = page.locator('button:has-text("Ouvrir")').first();
    if (await openBtn.count()) {
      await openBtn.click();
      await page.waitForTimeout(1_500);
    }
  } catch {}
  await page.goto(`${FRONT}/kpi`, { waitUntil: "networkidle", timeout: 30_000 });
  await page.waitForTimeout(4_000);

  // 2b) Switch from "KPI catalogue" tab to "Metrics catalogue" tab
  try {
    const metricsTab = page.getByRole("tab", { name: /metrics catalogue/i }).first();
    await metricsTab.click({ timeout: 5_000 });
    await page.waitForTimeout(1_500);
  } catch (e) {
    console.error("switch Metrics tab failed:", (e as Error).message);
  }

  // 3) Collapse LTE/NR, expand CAPTURE and all its 5 groups.
  // (LTE/NR were open by default — collapse to focus the screenshot on CAPTURE.)
  for (const name of ["LTE", "NR"]) {
    try {
      const btn = page.locator(`button:has-text("${name}")`, { hasText: new RegExp(`^${name}$`) }).first();
      // Only click if currently expanded (aria-expanded=true)
      const expanded = await btn.getAttribute("aria-expanded");
      if (expanded === "true") await btn.click({ timeout: 2_000 });
    } catch {}
  }
  await page.waitForTimeout(400);
  try {
    const captureRoot = page.locator('button:has-text("CAPTURE")').first();
    await captureRoot.waitFor({ timeout: 5_000 });
    await captureRoot.click();
    await page.waitForTimeout(400);
    // Click the inner CAPTURE category (same label, appears twice: tech + category)
    const allCapture = page.locator('button:has-text("CAPTURE")');
    const nn = await allCapture.count();
    if (nn > 1) {
      for (let i = 1; i < nn; i++) {
        try { await allCapture.nth(i).click({ timeout: 1_500 }); await page.waitForTimeout(100); } catch {}
      }
    }
    // Expand 5 groups
    for (const label of ["File", "Script", "Task", "Device", "Identity"]) {
      try {
        const btn = page.locator(`button:has-text("${label}")`, { hasText: new RegExp(`^${label}$`) }).first();
        await btn.click({ timeout: 2_000 });
        await page.waitForTimeout(150);
      } catch {}
    }
  } catch (e) {
    console.error("expand CAPTURE failed:", (e as Error).message);
  }
  await page.waitForTimeout(1_000);

  const outPath = `artifacts/shot-capture-tree-${PROJECT_ID}-${ts}.png`;
  await mkdir(dirname(outPath), { recursive: true });
  // Full page screenshot — the sidebar is the whole kpi-catalog aside.
  await page.screenshot({ path: outPath, fullPage: true });
  console.log("saved", outPath);

  // Also sidebar-only screenshot (clipped)
  const sidebar = page.locator('aside.kpi-catalog').first();
  const sidebarCount = await sidebar.count();
  if (sidebarCount > 0) {
    const sidebarPath = `artifacts/shot-capture-sidebar-${PROJECT_ID}-${ts}.png`;
    try {
      await sidebar.screenshot({ path: sidebarPath });
      console.log("saved", sidebarPath);
    } catch (e) {
      console.error("sidebar screenshot failed:", (e as Error).message);
    }
  }

  // Produce JSON report
  const title = await page.title();
  const report = {
    front: FRONT, api: API, projectId: PROJECT_ID,
    title, screenshot: outPath, catalog_version: "2.52.0", version: "0.83.0",
  };
  await writeFile(outPath.replace(/\.png$/, ".json"), JSON.stringify(report, null, 2));

  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
