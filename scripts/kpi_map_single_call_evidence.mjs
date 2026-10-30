import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

const base = process.env.BC4_FRONT_BASE ?? "http://127.0.0.1:9183";
const mode = process.argv[2] ?? "after";
const projectId = "43e81a34a073";
const captureId = "a4b0c321c52e";
const email = "bc4a4-mapcall@example.test";
const password = "bc4a4-mapcall-disposable-password";
const out = new URL(`../audit/bc4-kpi-map-single-call/${mode}/`, import.meta.url).pathname;
await mkdir(out, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  extraHTTPHeaders: { "Cache-Control": "no-cache" },
});
const page = await context.newPage();
const metricResponses = [];
const requestStartedAt = new WeakMap();
let panelOpenedAt = 0;

page.on("request", (request) => requestStartedAt.set(request, Date.now()));

page.on("response", (response) => {
  const url = response.url();
  if (!url.includes("/metrics/table?") && !url.includes("/metrics/map?")) return;
  const request = response.request();
  const startedAt = requestStartedAt.get(request) ?? Date.now();
  const item = {
    url,
    status: response.status(),
    relativeStartMs: panelOpenedAt ? Math.max(0, startedAt - panelOpenedAt) : null,
    bytes: 0,
    durationMs: null,
    mapPoints: [],
  };
  metricResponses.push(item);
  void response
    .body()
    .then((body) => {
      item.bytes = body.byteLength;
      const payload = JSON.parse(body.toString("utf8"));
      item.mapPoints = Array.isArray(payload.map_points) ? payload.map_points : [];
      item.durationMs = Date.now() - startedAt;
    })
    .catch(() => {});
});

await page.goto(`${base}/kpi`, { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.waitForTimeout(750);
if (new URL(page.url()).pathname === "/login") {
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL((url) => url.pathname !== "/login", { timeout: 30_000 });
  await page.evaluate(
    ({ projectId: activeProject, captureId: activeCapture, email: activeEmail }) => {
      localStorage.setItem(
        `bc4.activeProject.v1.${activeEmail}`,
        JSON.stringify({ id: activeProject, name: "Test_6" }),
      );
      localStorage.setItem(`bc4.activeCapture.${activeProject}`, activeCapture);
    },
    { projectId, captureId, email },
  );
  await page.goto(`${base}/kpi`, { waitUntil: "domcontentloaded", timeout: 120_000 });
}

const metricsTab = page.getByRole("tab", { name: /^Metrics(?: ·|$)/ });
if (
  !(await metricsTab.waitFor({ state: "visible", timeout: 180_000 }).then(
    () => true,
    () => false,
  ))
) {
  console.error("PAGE_URL", page.url());
  console.error("STORAGE", await page.evaluate(() => ({ ...localStorage })));
  console.error("BODY", (await page.locator("body").innerText()).slice(0, 2_000));
  await page.screenshot({ path: `${out}failure.png`, fullPage: true });
  throw new Error("metrics_tab_not_visible");
}
await metricsTab.click();
const search = page.getByRole("textbox", { name: /Search metrics|Rechercher.*métr/i }).first();
await search.waitFor({ timeout: 180_000 });
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
const mapItem = page.getByRole("menuitem", { name: /^Map$/ });
await mapItem.waitFor({ timeout: 30_000 });
await mapItem.click();

const card = page.locator("[data-view='map'][data-metric-code*='cell_rsrp']").first();
await card.waitFor({ state: "visible", timeout: 30_000 });
// The requirement starts when the panel is actually open, not while
// Playwright is still scrolling/waiting to dispatch the menu click.
panelOpenedAt = Date.now();
await page.waitForFunction(
  () => document.querySelector("[data-view='map'][data-point-count='4935']") !== null,
  undefined,
  { timeout: 120_000 },
);
const renderedAt = Date.now();
await page.waitForTimeout(500);
await Promise.all(metricResponses.map(async () => page.waitForTimeout(0)));
await page.screenshot({ path: `${out}map.png`, fullPage: true });

const candidates = metricResponses.filter((entry) => {
  const url = new URL(entry.url);
  if (url.pathname.endsWith("/metrics/map")) return true;
  return url.searchParams.get("include_map") === "true";
});
const tablePages = candidates.filter(
  (entry) =>
    new URL(entry.url).pathname.endsWith("/metrics/table") &&
    new URL(entry.url).searchParams.get("page_size") !== "25",
);
const contentResponses = tablePages.length ? tablePages : candidates;
const points = contentResponses
  .flatMap((entry) => entry.mapPoints)
  .sort((a, b) => `${a.code}:${a.seq}`.localeCompare(`${b.code}:${b.seq}`));
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
};
const contentSha256 = createHash("sha256")
  .update(JSON.stringify(canonical(points)))
  .digest("hex");
const report = {
  mode,
  base,
  projectId,
  captureId,
  panelToRenderedMs: renderedAt - panelOpenedAt,
  renderedPoints: Number(await card.getAttribute("data-point-count")),
  mapRequestCount: candidates.length,
  contentPointCount: points.length,
  contentSha256,
  requests: candidates.map(({ mapPoints, ...entry }) => ({ ...entry, points: mapPoints.length })),
};
await writeFile(`${out}report.json`, `${JSON.stringify(report, null, 2)}\n`);
await browser.close();

console.log(JSON.stringify(report, null, 2));
const expectedCalls = mode === "after" ? 1 : 6;
const pass =
  report.renderedPoints === 4935 &&
  report.contentPointCount === 4935 &&
  report.mapRequestCount === expectedCalls &&
  (mode !== "after" || report.panelToRenderedMs < 1500);
console.log(`VERDICT=${pass ? "PASS" : "FAIL"}`);
process.exitCode = pass ? 0 : 1;
