import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const front = process.env.BC4_FRONT_BASE ?? "http://127.0.0.1:9183";
const api = process.env.BC4_API_BASE ?? "http://127.0.0.1:9182";
const password = process.env.BC4_ADMIN_PASSWORD;
if (!password) throw new Error("BC4_ADMIN_PASSWORD is required");
const email = "admin@bc4.local";
const projectId = "43e81a34a073";
const captureId = "a4b0c321c52e";
const out = process.env.BC4_SCREENSHOT ?? "../audit/catalog-2.68.3-tree.png";

const login = await fetch(`${api}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
if (!login.ok) throw new Error(`login HTTP ${login.status}`);
const session = await login.json();
await mkdir(dirname(out), { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("pageerror", (error) => errors.push(error.message));
await page.addInitScript(
  ([value, pid, userEmail]) => {
    localStorage.setItem("bc4.session", JSON.stringify(value));
    localStorage.setItem(
      `bc4.activeProject.v1.${userEmail}`,
      JSON.stringify({ id: pid, name: "Test_6" }),
    );
  },
  [session, projectId, email],
);

await page.goto(`${front}/kpi?capture_id=${captureId}`, {
  waitUntil: "networkidle",
  timeout: 120_000,
});
const metricsTab = page.getByRole("tab", { name: /metrics|métriques|metriques/i });
await metricsTab.click();
const sidebar = page.getByTestId("unified-metrics-tree").locator("..");
const search = sidebar.locator("input").first();
await search.fill("LTE_EARFCN_SERVING");
await page.waitForTimeout(500);
const resizeHandle = page.locator(".kpi-resize-handle").first();
const resizeBox = await resizeHandle.boundingBox();
if (resizeBox) {
  await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + 120);
  await page.mouse.down();
  await page.mouse.move(resizeBox.x + 180, resizeBox.y + 120, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}
const prefixLeaves = await sidebar.locator('[data-testid^="metric-label-"]').count();
await page.screenshot({ path: out, fullPage: false });
await search.fill("LTE_EARFCN_SERVING_PCELL");
await page.waitForTimeout(300);
const exactLeaves = await sidebar.locator('[data-testid^="metric-label-"]').count();
const result = { out, prefixLeaves, exactLeaves, errors };
await writeFile(out.replace(/\.png$/, ".json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
await browser.close();
