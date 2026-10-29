import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const front = process.env.BC4_FRONT_BASE ?? "http://127.0.0.1:5174";
const tokenFile = process.env.BC4_TOKEN_FILE ?? "/tmp/bc1-kpi-ux-token";
const out = process.env.BC4_PROOF_DIR ?? "/home/devmat/BC4/audit/bc1-kpi-ux-feedback";
const projectId = "43e81a34a073";
const captureId = "a4b0c321c52e";
const selection = "cell_rsrp@lte-type-0";
const delaySeries = process.env.BC4_DELAY_SERIES === "1";
const legacyFront = process.env.BC4_LEGACY_FRONT === "1";
const token = readFileSync(tokenFile, "utf8").trim();
const me = await fetch("http://127.0.0.1:8000/auth/me", {
  headers: { Authorization: `Bearer ${token}` },
}).then((response) => response.json());

await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  acceptDownloads: true,
});
const page = await context.newPage();
page.setDefaultTimeout(60_000);
const consoleEntries = [];
page.on("console", (message) => {
  if (message.text().includes("[bc4:kpi-series-render]")) consoleEntries.push(message.text());
});
if (delaySeries) {
  await page.route("**/metrics/series?**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    await route.continue();
  });
  await page.route("**/metrics/table?**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    await route.continue();
  });
}

await page.addInitScript(
  ({ sessionToken, user, pid, cap, metric }) => {
    const session = {
      token: sessionToken,
      token_type: "Bearer",
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      user,
    };
    localStorage.setItem("bc4.session", JSON.stringify(session));
    localStorage.setItem(
      `bc4.activeProject.v1.${user.email}`,
      JSON.stringify({ id: pid, name: "Test_6" }),
    );
    localStorage.setItem("bc4.capture.v1." + pid, cap);
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("bc4.kpi.tabs.") || key.startsWith("bc3.metrics.pane"))
        localStorage.removeItem(key);
    }
    localStorage.setItem("bc1.kpi.ux.selection", metric);
  },
  { sessionToken: token, user: me, pid: projectId, cap: captureId, metric: selection },
);

const network = [];
page.on("request", (request) => {
  if (request.url().includes("/metrics/series")) {
    network.push({
      url: request.url(),
      start_ms: performance.now(),
      status: null,
      duration_ms: null,
      bytes: null,
    });
  }
});
page.on("response", async (response) => {
  if (!response.url().includes("/metrics/series")) return;
  const item = network.findLast((entry) => entry.url === response.url() && entry.status === null);
  if (!item) return;
  item.status = response.status();
  item.duration_ms = performance.now() - item.start_ms;
  try {
    item.bytes = (await response.body()).byteLength;
  } catch {
    item.bytes = null;
  }
});

await page.goto(`${front}/kpi`, { waitUntil: "networkidle" });
const metricsTab = page.getByRole("tab", { name: /metrics|métriques/i }).first();
if (await metricsTab.count()) await metricsTab.click();
const search = page.getByRole("textbox", { name: /search metrics|rechercher.*métr/i }).first();
await search.waitFor();
await search.fill("RSRP (bloc LTE) @ Serving");
const menu = page.getByRole("button", { name: /Visualisation RSRP.*Serving/i }).first();
await menu.waitFor();
await menu.click();
await page.getByRole("menuitem", { name: /Table|Tableau/i }).click();

let progressAnimation = null;
if (delaySeries) {
  const progress = page.locator(".kpi-measurements-progress:visible").last();
  await progress.waitFor();
  const probe = async () =>
    progress.locator("span").evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        animationName: style.animationName,
        animationDuration: style.animationDuration,
        transform: style.transform,
        reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
      };
    });
  const before = await probe();
  await page.waitForTimeout(250);
  const after = await probe();
  progressAnimation = { before, after, moved: before.transform !== after.transform };
  await page.screenshot({ path: `${out}/table-loading.png`, fullPage: true });
}

const table = page.getByTestId("metrics-table-panel");
await table.waitFor();
await table.getByTestId("workspace-panel-menu").click();
const downloadPromise = page.waitForEvent("download", { timeout: 10_000 });
await page.getByTestId("metrics-table-export").click();
const download = await downloadPromise;
const downloadPath = await download.path();
assert(downloadPath);
const exportBytes = readFileSync(downloadPath).byteLength;
await page.screenshot({ path: `${out}/table-export.png`, fullPage: true });

await menu.click();
await page.getByRole("menuitem", { name: /Graph|Graphique/i }).click();

const plot = page.getByTestId("metric-time-plot").first();
let animation = null;
if (delaySeries) {
  const spinner = page.getByTestId("chart-spinner").first();
  await spinner.waitFor();
  const probe = async () =>
    spinner.locator(".kpi-chart-spinner").evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        animationName: style.animationName,
        animationDuration: style.animationDuration,
        transform: style.transform,
        reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
      };
    });
  const before = await probe();
  await page.waitForTimeout(250);
  const after = await probe();
  animation = { before, after, moved: before.transform !== after.transform };
  await page.screenshot({ path: `${out}/graph-loading.png`, fullPage: true });
}
await plot.waitFor();
await page.evaluate(
  () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
);
const points = Number(await plot.getAttribute("data-n-points"));
const observedRenderMs = await page.evaluate(() => {
  const resource = performance
    .getEntriesByType("resource")
    .filter((entry) => entry.name.includes("/metrics/series?"))
    .at(-1);
  return resource ? Number((performance.now() - resource.responseEnd).toFixed(1)) : null;
});
const measuredRender = await plot.getAttribute("data-render-ms");
const measuredBytes = await plot.getAttribute("data-response-bytes");
const renderMs = measuredRender == null ? observedRenderMs : Number(measuredRender);
const responseBytes = measuredBytes == null ? null : Number(measuredBytes);
const firstSeriesRequest = network[0];
const observerRenderMs =
  firstSeriesRequest?.duration_ms == null
    ? null
    : Number(
        (performance.now() - firstSeriesRequest.start_ms - firstSeriesRequest.duration_ms).toFixed(
          1,
        ),
      );
await page.screenshot({ path: `${out}/graph-loaded.png`, fullPage: true });

let errorText = null;
let retryVisible = null;
let spinnerAfterError = null;
if (!legacyFront) {
  await search.fill("UL grants (bloc LTE) @ SCell 1");
  const failingMenu = page
    .getByRole("button", { name: /Visualisation UL grants.*SCell 1/i })
    .first();
  await failingMenu.waitFor();
  await failingMenu.click();
  await page.getByRole("menuitem", { name: /Graph|Graphique/i }).click();
  const errorState = page
    .getByTestId("kpi-query-error")
    .filter({ hasText: /Series unavailable|Série indisponible/ })
    .first();
  await errorState.waitFor({ timeout: 30_000 });
  errorText = (await errorState.innerText()).replace(/\s+/g, " ").trim();
  retryVisible = await errorState.getByRole("button", { name: /retry|réessayer/i }).isVisible();
  const errorCard = errorState.locator(
    "xpath=ancestor::article[contains(@class, 'kpi-graph-card')]",
  );
  spinnerAfterError = await errorCard.getByTestId("chart-spinner").count();
  await page.screenshot({ path: `${out}/http-500-retry.png`, fullPage: true });
  await page.waitForTimeout(250);
}

const report = {
  front,
  projectId,
  captureId,
  selection,
  points,
  renderMs,
  observedRenderMs,
  observerRenderMs,
  responseBytes,
  exportBytes,
  animation,
  progressAnimation,
  errorText,
  retryVisible,
  spinnerAfterError,
  consoleEntries,
  network,
};
await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
