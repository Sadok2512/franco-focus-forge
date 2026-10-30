import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const base = process.env.BC4_FRONT_BASE ?? "http://127.0.0.1:9183";
const projectId = process.env.BC4_PROJECT_ID ?? "43e81a34a073";
const captureId = process.env.BC4_CAPTURE_ID ?? "a4b0c321c52e";
const auditPassword = process.env.BC4_AUDIT_PASSWORD ?? "bc4a4-disposable-password";
const mode = process.argv[2] ?? "after";
const out = new URL(`../audit/bc4-parameters-kpi-fix/${mode}/`, import.meta.url).pathname;
await mkdir(out, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
const requests = [];
const consoleEntries = [];
page.on("request", (request) => {
  if (["fetch", "xhr"].includes(request.resourceType())) requests.push(request.url());
});
page.on("console", (message) =>
  consoleEntries.push({ type: message.type(), text: message.text(), at: Date.now() }),
);

await page.goto(`${base}/kpi`, { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.waitForTimeout(750);
if (new URL(page.url()).pathname === "/login") {
  await page.getByLabel("Adresse e-mail").fill("bc4a4-test@local.invalid");
  await page.getByLabel("Mot de passe", { exact: true }).fill(auditPassword);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL((url) => url.pathname !== "/login", { timeout: 30_000 });
  await page.evaluate(
    ({ activeProject, activeCapture }) => {
      localStorage.setItem(
        "bc4.activeProject.v1.bc4a4-test@local.invalid",
        JSON.stringify({ id: activeProject, name: "Test_6" }),
      );
      localStorage.setItem(`bc4.activeCapture.${activeProject}`, activeCapture);
    },
    { activeProject: projectId, activeCapture: captureId },
  );
  await page.goto(`${base}/kpi`, { waitUntil: "domcontentloaded", timeout: 120_000 });
}
await page.getByRole("tab", { name: /^KPI(?: ·|$)/ }).waitFor({ timeout: 120_000 });
await page.waitForTimeout(1_500);
const kpiText = await page.locator("aside.kpi-catalog").first().innerText();
const warningsBeforeScreenshot = consoleEntries.filter((entry) => entry.type === "warning").length;
await page.screenshot({ path: `${out}kpi.png`, fullPage: true });

await page.getByRole("tab", { name: /^Metrics(?: ·|$)/ }).click();
const metricsSearch = page
  .getByRole("textbox", { name: /Search metrics|Rechercher.*métr/i })
  .first();
await metricsSearch.fill("RSRP");
const metricLeaf = page
  .getByTestId("unified-metrics-tree")
  .locator(":scope > ul")
  .nth(1)
  .locator(".kpi-tree-leaf button[aria-pressed]:not([disabled])")
  .first();
let webglWarningsBeforeMapScreenshot = null;
let webglWarningsAfterMapScreenshot = null;
if (
  await metricLeaf.waitFor({ state: "visible", timeout: 30_000 }).then(
    () => true,
    () => false,
  )
) {
  await metricLeaf.click();
  await page.waitForTimeout(3_000);
  const leafMenu = metricLeaf.locator("..").locator("button.kpi-leaf-menu");
  if (await leafMenu.isVisible()) {
    await leafMenu.click();
    const mapItem = page.getByRole("menuitem", { name: /^Map$/ });
    if (await mapItem.isVisible()) {
      await mapItem.click();
      await page.locator("canvas.maplibregl-canvas").waitFor({ timeout: 30_000 });
      await page.waitForTimeout(1_500);
      webglWarningsBeforeMapScreenshot = consoleEntries.filter(
        (entry) => entry.type === "warning" && /WebGL|ReadPixels|GPU stall/i.test(entry.text),
      ).length;
      await page.screenshot({ path: `${out}metrics-map.png`, fullPage: true });
      webglWarningsAfterMapScreenshot = consoleEntries.filter(
        (entry) => entry.type === "warning" && /WebGL|ReadPixels|GPU stall/i.test(entry.text),
      ).length;
    }
  }
}

await page.getByRole("tab", { name: /^Parameters(?: ·|$)/ }).click();
await page.getByTestId("dict-tree-search").fill("dl-Bandwidth");
const parameterLeaf = page.getByTestId("catalog-leaf").first();
if (
  await parameterLeaf.waitFor({ state: "visible", timeout: 30_000 }).then(
    () => true,
    () => false,
  )
) {
  await parameterLeaf.click();
  await page.waitForTimeout(1_500);
}
const parameterLayout = await page.evaluate(() => {
  const root = document.querySelector(".rrc-kpi-parameters");
  if (!root) return null;
  const labels = [...root.querySelectorAll(".rrc-hierarchy-name")].map((node) => ({
    text: node.textContent?.trim() ?? "",
    title: node.closest("button")?.getAttribute("title") ?? "",
  }));
  const headers = [...root.querySelectorAll("thead th:not(:first-child)")].map(
    (node) => node.getBoundingClientRect().right,
  );
  const firstValueRow = root.querySelector("tbody tr[data-row-kind='value']");
  const firstValues = firstValueRow
    ? [...firstValueRow.querySelectorAll("td.rrc-number")].map(
        (node) => node.getBoundingClientRect().right,
      )
    : [];
  const hierarchyChildrenAligned = [...root.querySelectorAll(".rrc-hierarchy-toggle")].every(
    (button) => {
      const children = [...button.children].map((child) => child.getBoundingClientRect());
      return (
        children.length < 2 ||
        Math.max(...children.map((box) => box.top)) - Math.min(...children.map((box) => box.top)) <
          4
      );
    },
  );
  return {
    labels,
    headerRights: headers,
    valueRights: firstValues,
    rightEdgeDelta: headers.map((right, index) => Math.abs(right - (firstValues[index] ?? right))),
    hierarchyChildrenAligned,
  };
});
await page.screenshot({ path: `${out}parameters.png`, fullPage: true });

await page.goto(`${base}/rrc`, { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.getByTestId("dict-tree-search").waitFor({ timeout: 120_000 });
await page.waitForTimeout(1_000);
const rrcSignature = {
  title: await page.title(),
  tabs: await page.getByRole("tab").allTextContents(),
  searchPlaceholder: await page.getByTestId("dict-tree-search").getAttribute("placeholder"),
};
await page.screenshot({ path: `${out}rrc.png`, fullPage: true });

const metricRequests = requests
  .filter((url) => url.includes("/metrics/series?") || url.includes("/metrics/table?"))
  .map((url) => ({
    url,
    captureIdOccurrences: new URL(url).searchParams.getAll("capture_id").length,
  }));
const report = {
  command:
    "BC4_FRONT_BASE=http://127.0.0.1:9183 BC4_API_CONTAINER=bc4a4-api node scripts/parameters_kpi_fix_evidence.mjs " +
    mode,
  base,
  projectId,
  captureId,
  kpiText,
  metricRequests,
  warningsBeforeScreenshot,
  webglWarningsBeforeMapScreenshot,
  webglWarningsAfterMapScreenshot,
  parameterLayout,
  consoleEntries,
  rrcSignature,
};
await writeFile(`${out}report.json`, `${JSON.stringify(report, null, 2)}\n`);
await browser.close();

const duplicateRequests = metricRequests.filter((entry) => entry.captureIdOccurrences !== 1);
console.log(`KPI_TEXT=${JSON.stringify(kpiText.split("\n").slice(0, 4))}`);
console.log(
  `METRIC_REQUESTS=${metricRequests.length} DUPLICATE_CAPTURE_ID=${duplicateRequests.length}`,
);
console.log(`WEBGL_WARNINGS_BEFORE_SCREENSHOT=${warningsBeforeScreenshot}`);
console.log(
  `WEBGL_MAP_BEFORE_SCREENSHOT=${webglWarningsBeforeMapScreenshot} WEBGL_MAP_AFTER_SCREENSHOT=${webglWarningsAfterMapScreenshot}`,
);
console.log(`PARAMETERS_LAYOUT=${JSON.stringify(parameterLayout)}`);
console.log(`VERDICT=${duplicateRequests.length === 0 ? "PASS" : "FAIL"}`);
process.exitCode = duplicateRequests.length === 0 ? 0 : 1;
