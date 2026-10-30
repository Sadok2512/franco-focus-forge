import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const base = process.env.BC4_FRONT_BASE ?? "http://127.0.0.1:9183";
const projectId = "43e81a34a073";
const captureId = "a4b0c321c52e";
const email = "bc4a4-mapdefaults@example.test";
const password = "bc4a4-mapdefaults-disposable-password";
const out = new URL("../audit/bc4-map-defaults/", import.meta.url).pathname;
await mkdir(out, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
await page.goto(`${base}/login`, { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.getByLabel(/Adresse e-mail|Email address/).fill(email);
await page.getByLabel(/Mot de passe|Password/, { exact: true }).fill(password);
await page.getByRole("button", { name: /Se connecter|Sign in/, exact: true }).click();
await page.waitForURL((url) => url.pathname !== "/login", { timeout: 30_000 });
await page.evaluate(
  ({ projectId: pid, captureId: cid, email: user }) => {
    localStorage.setItem(`bc4.activeProject.v1.${user}`, JSON.stringify({ id: pid, name: "Test_6" }));
    localStorage.setItem(`bc4.activeCapture.${pid}`, cid);
    localStorage.removeItem("bc4.map.sitesLayer.v4");
  },
  { projectId, captureId, email },
);

const report = { base, projectId, captureId, maps: {}, filters: {}, reconnect: {} };
async function waitForVisibleCells(statusbar) {
  const handle = await statusbar.elementHandle();
  await page.waitForFunction(
    (node) =>
      [...node.querySelectorAll("span")].some(
        (span) =>
          /^(Cells|Cellules)$/.test(span.lastElementChild?.textContent?.trim() ?? "") &&
          span.querySelector("strong")?.textContent?.trim() !== "—",
      ),
    handle,
    { timeout: 60_000 },
  );
  return statusbar.evaluate((node) => {
    const row = [...node.querySelectorAll("span")].find((span) =>
      /^(Cells|Cellules)$/.test(span.lastElementChild?.textContent?.trim() ?? ""),
    );
    return row?.querySelector("strong")?.textContent?.trim() ?? "—";
  });
}
async function captureMap(path, name) {
  await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  const chrome = page.getByTestId("network-map-chrome").first();
  await chrome.waitFor({ state: "visible", timeout: 180_000 });
  const cells = chrome.getByRole("button", { name: /^(Cells|Cellules)$/ });
  await cells.waitFor({ state: "visible" });
  await page.waitForTimeout(2_000);
  const pressed = await cells.getAttribute("aria-pressed");
  const centerButton = chrome.getByRole("button", { name: /Center on route|Centrer sur le parcours/ });
  const centerVisible = await centerButton.isVisible();
  const visibleCells = await waitForVisibleCells(chrome.getByTestId("map-workspace-statusbar"));
  await page.screenshot({ path: `${out}${name}.png`, fullPage: true });
  report.maps[name] = { cellsPressed: pressed, visibleCells, centerOnRouteVisible: centerVisible };
}

await captureMap("/map?capture_id=a4b0c321c52e", "map-open");
await captureMap("/signaling?capture_id=a4b0c321c52e", "signaling-open");

await page.goto(`${base}/kpi`, { waitUntil: "domcontentloaded", timeout: 120_000 });
const metricsTab = page.getByRole("tab", { name: /^Metrics/ });
await metricsTab.waitFor({ state: "visible", timeout: 180_000 });
await metricsTab.click();
const search = page.getByRole("textbox", { name: /Search metrics|Rechercher.*métr/i }).first();
await search.fill("RSRP");
const tree = page.getByTestId("unified-metrics-tree");
const leafButton = tree
  .locator(".kpi-tree-leaf button[aria-pressed]:not([disabled])")
  .filter({ hasText: /RSRP.*Serving/i })
  .first();
await leafButton.waitFor({ state: "visible", timeout: 180_000 });
await leafButton.click();
const leaf = leafButton.locator("xpath=ancestor::*[contains(@class,'kpi-tree-leaf')][1]");
await leaf.locator("button.kpi-leaf-menu").click();
await page.getByRole("menuitem", { name: /^(Map|Carte)$/ }).click();
const metricCard = page.locator("[data-view='map'][data-metric-code*='cell_rsrp']").first();
await metricCard.waitFor({ state: "visible", timeout: 120_000 });
await metricCard.getByTestId("network-map-chrome").waitFor({ state: "visible", timeout: 120_000 });
await page.waitForTimeout(2_000);
const metricCells = metricCard.getByRole("button", { name: /^(Cells|Cellules)$/ });
const metricVisibleCells = await waitForVisibleCells(
  metricCard.getByTestId("map-workspace-statusbar"),
);
report.maps["kpi-open"] = {
  cellsPressed: await metricCells.getAttribute("aria-pressed"),
  visibleCells: metricVisibleCells,
  centerOnRouteVisible: await metricCard
    .getByRole("button", { name: /Center on route|Centrer sur le parcours/ })
    .isVisible(),
};
await page.screenshot({ path: `${out}kpi-open.png`, fullPage: true });

for (const width of [1440, 1920]) {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto(`${base}/kpi`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  const filters = page.locator(".kpi-filterbar");
  await filters.waitFor({ state: "visible", timeout: 120_000 });
  const nav = page.locator(".app-header");
  const [filterBox, navBox] = await Promise.all([filters.boundingBox(), nav.boundingBox()]);
  const clear = Boolean(filterBox && navBox && filterBox.y >= navBox.y + navBox.height);
  report.filters[width] = { filterBox, navBox, clear };
  await page.screenshot({ path: `${out}filters-${width}.png`, fullPage: true });
}

const reconnectPage = await context.newPage();
await reconnectPage.addInitScript((pid) => {
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (key?.includes(`project-kpi.catalog.${pid}`)) localStorage.removeItem(key);
  }
}, projectId);
await reconnectPage.route(`**/api/projects/${projectId}/kpi/catalog`, (route) => route.abort("connectionrefused"));
await reconnectPage.goto(`${base}/kpi`, { waitUntil: "domcontentloaded", timeout: 120_000 });
const reconnectStatus = reconnectPage.getByRole("status").filter({ hasText: /Loading \/ reconnecting|Chargement \/ reconnexion/ });
await reconnectStatus.waitFor({ state: "visible", timeout: 30_000 });
const reconnectText = await reconnectStatus.innerText();
await reconnectPage.screenshot({ path: `${out}reconnecting.png`, fullPage: true });
report.reconnect = { text: reconnectText, containsZero: /(?:^|\s)0(?:\s|$)|0\/8/.test(reconnectText) };

const pass =
  Object.values(report.maps).every(
    (item) => item.cellsPressed === "true" && item.visibleCells !== "—" && item.centerOnRouteVisible,
  ) &&
  Object.values(report.filters).every((item) => item.clear) &&
  !report.reconnect.containsZero;
report.verdict = pass ? "PASS" : "FAIL";
await writeFile(`${out}report.json`, `${JSON.stringify(report, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify(report, null, 2));
console.log(`VERDICT=${report.verdict}`);
process.exitCode = pass ? 0 : 1;
