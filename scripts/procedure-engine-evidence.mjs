import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const base = process.env.BC4_FRONT_BASE ?? "http://127.0.0.1:9183";
const email = process.env.BC4_TEST_EMAIL ?? "procedure-audit@bc4.invalid";
const password = process.env.BC4_TEST_PASSWORD ?? "Disposable-procedure-2026!";
const projectId = "43e81a34a073";
const captureId = "a4b0c321c52e";
const out = new URL("../audit/bc4-procedure-engine/ui/", import.meta.url).pathname;
await mkdir(out, { recursive: true });

const loginResponse = await fetch(`${base}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
if (!loginResponse.ok) throw new Error(`login HTTP ${loginResponse.status}`);
const login = await loginResponse.json();

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addInitScript(
  ({ login, email, projectId, captureId }) => {
    localStorage.setItem(
      "bc4.session",
      JSON.stringify({ ...login, token_type: "Bearer" }),
    );
    localStorage.setItem(
      `bc4.activeProject.v1.${email}`,
      JSON.stringify({ id: projectId, name: "Test_6" }),
    );
    localStorage.setItem(`bc4.activeCapture.${projectId}`, captureId);
  },
  { login, email, projectId, captureId },
);

const page = await context.newPage();
const consoleErrors = [];
const apiErrors = [];
const procedureResponses = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("response", (response) => {
  if (!response.url().includes("/api/")) return;
  if (response.url().includes("/procedures"))
    procedureResponses.push({ url: response.url(), status: response.status() });
  if (response.status() >= 400) apiErrors.push({ url: response.url(), status: response.status() });
});

await page.goto(`${base}/kpi`, { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.getByRole("tab", { name: /^KPI(?: ·|$)/ }).waitFor({ timeout: 180_000 });
const aside = page.locator("aside.kpi-catalog").first();
const search = aside.locator("input");
await search.fill("LTE RRC Setup Success Rate");
const setupLeaf = aside
  .locator('.kpi-tree-leaf[title*="LTE_RRC_SETUP_SR"]')
  .first();
await setupLeaf.waitFor({ timeout: 120_000 });
const setupTitle = await setupLeaf.getAttribute("title");
if (!setupTitle?.includes("LTE_RRC_SETUP_SR"))
  throw new Error(`unexpected setup leaf: ${setupTitle}`);

const beforeDirectClick = await page.locator('article[data-code^="PROC_"]').count();
await setupLeaf.locator("button[aria-pressed]").click();
await page.waitForTimeout(250);
const afterDirectClick = await page.locator('article[data-code^="PROC_"]').count();
if (beforeDirectClick !== afterDirectClick)
  throw new Error("direct procedure leaf click created a panel");

await setupLeaf.locator("button.kpi-leaf-menu").click();
const setupMenu = page.locator('[role="menu"]').last();
await setupMenu.waitFor();
await setupMenu.getByRole("menuitem", { name: /Graph|Graphe/ }).click();
const graph = page.locator('article[data-code="LTE_RRC_SETUP_SR"]');
await graph.waitFor({ timeout: 120_000 });
await graph.locator('[data-status="Available"], .kpi-plot').first().waitFor({ timeout: 120_000 });
await page.screenshot({ path: `${out}01-kpi-procedure-graph.png`, fullPage: true });

await setupLeaf.locator("button.kpi-leaf-menu").click();
await page.locator('[role="menu"]').last().getByRole("menuitem", { name: /Table|Tableau/ }).click();
await page.getByRole("dialog").getByText(/Procedures|Procédures/).first().waitFor({ timeout: 120_000 });
await page.screenshot({ path: `${out}02-procedure-evidence-table.png`, fullPage: true });
const tableRows = await page.getByRole("dialog").locator("tbody tr").count();
await page.keyboard.press("Escape");

await search.fill("LTE RACH Failures");
const rachLeaf = aside.locator('.kpi-tree-leaf[title*="LTE_RACH_FAILURES"]').first();
await rachLeaf.waitFor({ timeout: 120_000 });
const rachTitle = await rachLeaf.getAttribute("title");
if (!rachTitle?.includes("LTE_RACH_FAILURES"))
  throw new Error(`unexpected RACH leaf: ${rachTitle}`);
await rachLeaf.locator("button.kpi-leaf-menu").click();
await page.locator('[role="menu"]').last().getByRole("menuitem", { name: /Map|Carte/ }).click();
const map = page.locator('article[data-code="LTE_RACH_FAILURES"]');
await map.waitFor({ timeout: 120_000 });
await map.locator("canvas").first().waitFor({ timeout: 120_000 });
await map.getByTestId("procedure-map-count").waitFor({ timeout: 120_000 });
await page.screenshot({ path: `${out}03-procedure-map.png`, fullPage: true });

const result = {
  base,
  projectId,
  captureId,
  directClickPanelsBefore: beforeDirectClick,
  directClickPanelsAfter: afterDirectClick,
  tableRows,
  procedureResponses,
  apiErrors,
  consoleErrors,
};
await writeFile(`${out}playwright.json`, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
await browser.close();
if (apiErrors.length || consoleErrors.length) process.exitCode = 1;
