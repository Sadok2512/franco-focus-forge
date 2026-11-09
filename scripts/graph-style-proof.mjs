import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const front = process.env.BC4_FRONT_BASE ?? "http://127.0.0.1:5174";
const api = process.env.BC4_API_BASE ?? "http://127.0.0.1:8000";
const output = process.env.BC4_GRAPH_STYLE_PROOF ?? "audit/graph-style-proof";
const expected = process.env.EXPECTED_RENDER;
const projectId = "43e81a34a073";
const captureId = "a4b0c321c52e";
const selection = "cell_rsrp@lte-type-0";

const password =
  process.env.BC4_ADMIN_PASSWORD ??
  readFileSync(
    process.env.BC4_ADMIN_PASSWORD_FILE ?? "/home/devmat/BC4/.secrets/admin_pw",
    "utf8",
  ).trim();
const login = await fetch(`${api}/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: process.env.BC4_ADMIN_EMAIL ?? "admin@bc4.local", password }),
});
assert(login.ok, `login HTTP ${login.status}`);
const session = await login.json();

await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(60_000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
page.on("requestfailed", (request) => {
  if (request.failure()?.errorText !== "net::ERR_ABORTED")
    errors.push(`${request.failure()?.errorText}: ${request.url()}`);
});

await page.addInitScript(
  ({ activeSession, pid, cap }) => {
    localStorage.setItem(
      "bc4.session",
      JSON.stringify({
        ...activeSession,
        expires_at: activeSession.expires_at ?? new Date(Date.now() + 3_600_000).toISOString(),
      }),
    );
    localStorage.setItem(
      `bc4.activeProject.v1.${activeSession.user.email}`,
      JSON.stringify({ id: pid, name: "Test_6" }),
    );
    localStorage.setItem("bc4.capture.v1." + pid, cap);
    for (const key of Object.keys(localStorage)) {
      if (
        key.startsWith("bc4.kpi.tabs.") ||
        key.startsWith("bc3.metrics.pane") ||
        key.startsWith("bc3.metrics.styles") ||
        key.startsWith("bc4.graph.series-management")
      )
        localStorage.removeItem(key);
    }
  },
  { activeSession: session, pid: projectId, cap: captureId },
);

try {
  await page.goto(`${front}/kpi`, { waitUntil: "networkidle" });
  const metricsTab = page.getByRole("tab", { name: /metrics|métriques/i }).first();
  await metricsTab.waitFor();
  await metricsTab.click();
  const search = page.getByRole("textbox", { name: /search metrics|rechercher.*métr/i }).first();
  await search.fill("LTE_RSRP_SERVING_PCELL");
  const visualization = page.getByTestId(/^metric-menu-/).first();
  await visualization.click();
  await page.getByRole("menuitem", { name: /Graph|Graphique/i }).click();

  const card = page.locator(`[data-metric-code="${selection}"]`).first();
  const plot = card.getByTestId("metric-time-plot");
  await plot.waitFor();
  await card.getByTestId("workspace-panel-menu").click();
  await page.getByTestId("metric-style-sub").click();
  await page.getByTestId("metric-plot-line").click();
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );

  const result = await plot.evaluate((element) => ({
    render: element.getAttribute("data-series-render"),
    colors: element.getAttribute("data-series-colors"),
    lineWidths: element.getAttribute("data-series-line-widths"),
    lineCurves: element.querySelectorAll(".recharts-line-curve").length,
    scatterSymbols: element.querySelectorAll(".recharts-scatter-symbol").length,
    bars: element.querySelectorAll(".recharts-bar-rectangle").length,
  }));
  await page.keyboard.press("Escape");
  await card.screenshot({ path: `${output}/line.png`, animations: "disabled" });

  if (expected) assert(result.render?.endsWith(`:${expected}`), JSON.stringify(result));
  assert.equal(errors.length, 0, errors.join("\n"));
  await writeFile(
    `${output}/report.json`,
    JSON.stringify(
      { front, projectId, captureId, selection, expected, ...result, errors },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ expected, ...result, errors }, null, 2));
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => undefined);
  await writeFile(
    `${output}/failure.json`,
    JSON.stringify({ url: page.url(), errors, error: String(error) }, null, 2),
  );
  console.error(JSON.stringify({ url: page.url(), errors }, null, 2));
  throw error;
} finally {
  await browser.close();
}
