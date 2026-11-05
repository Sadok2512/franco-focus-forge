import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.BC4_FRONT_BASE ?? "http://127.0.0.1:5192";
const out = process.env.BC4_PROOF_DIR ?? "audit/bc1-radio-snapshot-zoom/candidate";
const passwordFile = process.env.BC4_PASSWORD_FILE ?? "/home/devmat/BC4/.secrets/admin_pw";
const projectId = "43e81a34a073";
const captureId = "a4b0c321c52e";
const workspaceId = "snapshot-zoom-proof";
const graphPanelId = "graph-proof";
const snapshotPanelId = "snapshot-proof";
const metric = "cell_rsrp@lte-type-0";

await mkdir(out, { recursive: true });
const password = (await readFile(passwordFile, "utf8")).trim();
const login = await fetch(`${base}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@bc4.local", password }),
});
assert.equal(login.status, 200, `login HTTP ${login.status}`);
const session = await login.json();
assert.equal(typeof session.token, "string", "login did not return a token");
const meResponse = await fetch(`${base}/api/auth/me`, {
  headers: { Authorization: `Bearer ${session.token}` },
});
assert.equal(meResponse.status, 200, `/auth/me HTTP ${meResponse.status}`);
const user = await meResponse.json();

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(90_000);
const consoleErrors = [];
const apiErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));
page.on("response", (response) => {
  if (response.url().includes("/api/") && response.status() >= 400) {
    apiErrors.push({ status: response.status(), url: response.url() });
  }
});

await page.addInitScript(
  ({ auth, account, pid, cap, tabId, graphId, snapshotId, selection }) => {
    localStorage.setItem(
      "bc4.session",
      JSON.stringify({
        token: auth.token,
        token_type: "Bearer",
        expires_at: auth.expires_at,
        user: account,
      }),
    );
    localStorage.setItem(
      `bc4.activeProject.v1.${account.email}`,
      JSON.stringify({ id: pid, name: "Test_6" }),
    );
    sessionStorage.setItem(`bc4.capture.v2.${pid}`, cap);
    localStorage.setItem(`bc4.capture.v2.${pid}`, cap);
    const tabs = {
      t: [
        {
          i: tabId,
          n: "Snapshot + Zoom",
          c: [],
          m: [selection],
          a: null,
          l: "2",
          o: 0,
          s: [],
        },
        { i: "proof-other", n: "Other", c: [], m: [], a: null, l: "2", o: 0, s: [] },
      ],
      a: tabId,
    };
    localStorage.setItem(`bc4.kpi.tabs.${pid}`, btoa(JSON.stringify(tabs)));
    localStorage.setItem(
      `bc4.metrics.card-panels.${tabId}`,
      JSON.stringify([
        { id: snapshotId, code: selection, view: "snapshot" },
        { id: graphId, code: selection, view: "graph" },
      ]),
    );
    localStorage.setItem(`bc4.kpi.events.${pid}.${tabId}`, "0");
    localStorage.setItem(`bc4.kpi.pointSync.v1.${pid}.${tabId}`, "true");
  },
  {
    auth: session,
    account: user,
    pid: projectId,
    cap: captureId,
    tabId: workspaceId,
    graphId: graphPanelId,
    snapshotId: snapshotPanelId,
    selection: metric,
  },
);

await page.goto(`${base}/kpi`, { waitUntil: "domcontentloaded" });
const snapshot = page.getByTestId("radio-snapshot-panel");
const plot = page.getByTestId("metric-time-plot");
await snapshot.waitFor();
await plot.waitFor();
await page.waitForFunction(
  () => document.querySelector(".radio-snapshot-metrics")?.getAttribute("aria-busy") === "false",
);
await page.waitForTimeout(250);
if (process.env.BC4_BASELINE === "1") {
  await page.screenshot({ path: `${out}/snapshot-graph-before.png`, fullPage: true });
  await writeFile(
    `${out}/report.json`,
    `${JSON.stringify({ base, projectId, captureId, metric, consoleErrors, apiErrors }, null, 2)}\n`,
  );
  await browser.close();
  process.exit(0);
}

const snapshotRows = snapshot.locator(".radio-snapshot-metric");
assert.ok((await snapshotRows.count()) >= 2, "Snapshot needs at least two available RF rows");
const rowLayout = await snapshotRows.evaluateAll((rows) =>
  rows.map((row) => {
    const name = row.querySelector(".radio-snapshot-metric-name")?.getBoundingClientRect();
    const value = row.querySelector(".radio-snapshot-value")?.getBoundingClientRect();
    const bar = row.querySelector(".radio-snapshot-bar")?.getBoundingClientRect();
    const box = row.getBoundingClientRect();
    return {
      code: row.getAttribute("data-snapshot-code"),
      height: box.height,
      nameRight: name?.right,
      valueLeft: value?.left,
      valueRight: value?.right,
      barLeft: bar?.left,
      barWidth: bar?.width,
    };
  }),
);
for (const row of rowLayout) {
  assert.ok(row.height >= 30 && row.height <= 40, `non-compact metric row ${JSON.stringify(row)}`);
  assert.ok((row.nameRight ?? 0) <= (row.valueLeft ?? 0), `name/value overlap ${row.code}`);
  assert.ok((row.valueRight ?? 0) <= (row.barLeft ?? 0), `value/bar overlap ${row.code}`);
  assert.ok((row.barWidth ?? 0) > 35, `bar too small ${row.code}`);
}

const permanentButtons = await snapshot.locator("button").evaluateAll((buttons) =>
  buttons
    .filter((button) => getComputedStyle(button).opacity !== "0")
    .map((button) => button.getAttribute("aria-label") ?? button.textContent?.trim())
    .filter((label) => label === "↑" || label === "↓" || label === "X"),
);
assert.deepEqual(permanentButtons, [], "permanent up/down/remove controls remain visible");

const firstRow = snapshotRows.nth(0);
const secondRow = snapshotRows.nth(1);
const initialOrder = await snapshotRows.evaluateAll((rows) =>
  rows.map((row) => row.getAttribute("data-snapshot-code")),
);
await firstRow.hover();
const grip = firstRow.locator(".radio-snapshot-row-grip");
await page.waitForTimeout(180);
assert.equal(await grip.evaluate((node) => getComputedStyle(node).opacity), "1");
const gripBox = await grip.boundingBox();
const secondBox = await secondRow.boundingBox();
assert(gripBox && secondBox);
await page.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2);
await page.mouse.down();
await page.mouse.move(secondBox.x + secondBox.width / 2, secondBox.y + secondBox.height / 2, {
  steps: 6,
});
await page.mouse.up();
await page.waitForTimeout(150);
const reordered = await snapshotRows.evaluateAll((rows) =>
  rows.map((row) => row.getAttribute("data-snapshot-code")),
);
assert.notDeepEqual(reordered, initialOrder, "row drag did not reorder metrics");

await snapshot.getByRole("button", { name: /Add metric|Ajouter une métrique/i }).click();
const picker = page.getByTestId("radio-snapshot-picker");
await picker.waitFor();
await picker.getByRole("textbox").fill("RSRQ");
assert.ok((await picker.locator(".radio-snapshot-picker-list button").count()) > 0);
await picker.getByRole("button", { name: /Close|Fermer/i }).click();

const readDomain = async () => ({
  start: Number(await plot.getAttribute("data-zoom-start")),
  end: Number(await plot.getAttribute("data-zoom-end")),
  min: Number(await plot.getAttribute("data-x-min")),
  max: Number(await plot.getAttribute("data-x-max")),
  points: Number(await plot.getAttribute("data-n-points")),
});
const fullDomain = await readDomain();
assert.ok(fullDomain.points > 50, `graph has only ${fullDomain.points} points`);
assert.ok(fullDomain.max > fullDomain.min, "full X domain is empty");

const plotBox = await plot.boundingBox();
assert(plotBox);
await page.mouse.move(plotBox.x + plotBox.width * 0.58, plotBox.y + plotBox.height * 0.38);
await page.mouse.click(plotBox.x + plotBox.width * 0.58, plotBox.y + plotBox.height * 0.38);
await page.waitForFunction(
  () => !document.querySelector('[data-testid="radio-snapshot-time"]')?.textContent?.includes("Latest sample"),
);
await page.waitForFunction(() =>
  [...document.querySelectorAll(".radio-snapshot-value")].some(
    (node) => !/^(N\/A|N\/D)$/.test(node.textContent?.trim() ?? ""),
  ),
);
const syncedSnapshot = {
  time: (await snapshot.getByTestId("radio-snapshot-time").innerText()).trim(),
  values: await snapshot.locator(".radio-snapshot-value").allInnerTexts(),
};

const travellers = plot.locator(".recharts-brush-traveller");
assert.equal(await travellers.count(), 2, "Brush does not expose two handles");
const leftHandle = await travellers.nth(0).boundingBox();
const rightHandle = await travellers.nth(1).boundingBox();
assert(leftHandle && rightHandle);
const brushWidth = rightHandle.x - leftHandle.x;
await page.mouse.move(leftHandle.x + leftHandle.width / 2, leftHandle.y + leftHandle.height / 2);
await page.mouse.down();
await page.mouse.move(leftHandle.x + brushWidth * 0.2, leftHandle.y + leftHandle.height / 2, {
  steps: 8,
});
await page.mouse.up();
await page.waitForTimeout(200);
const afterLeft = await readDomain();
assert.ok(afterLeft.min > fullDomain.min, "left handle did not advance visible X min");
assert.equal(afterLeft.points, fullDomain.points, "left zoom changed source point count");

const rightAfterLeft = await travellers.nth(1).boundingBox();
assert(rightAfterLeft);
await page.mouse.move(
  rightAfterLeft.x + rightAfterLeft.width / 2,
  rightAfterLeft.y + rightAfterLeft.height / 2,
);
await page.mouse.down();
await page.mouse.move(rightAfterLeft.x - brushWidth * 0.15, rightAfterLeft.y + rightAfterLeft.height / 2, {
  steps: 8,
});
await page.mouse.up();
await page.waitForTimeout(200);
const afterRight = await readDomain();
assert.ok(afterRight.max < fullDomain.max, "right handle did not reduce visible X max");
assert.equal(afterRight.points, fullDomain.points, "right zoom changed source point count");

const slide = plot.locator(".recharts-brush-slide");
const slideBox = await slide.boundingBox();
assert(slideBox);
await page.mouse.move(slideBox.x + slideBox.width / 2, slideBox.y + slideBox.height / 2);
await page.mouse.down();
await page.mouse.move(slideBox.x + slideBox.width / 2 + 24, slideBox.y + slideBox.height / 2, {
  steps: 8,
});
await page.mouse.up();
await page.waitForTimeout(200);
const afterPan = await readDomain();
assert.ok(
  afterPan.min !== afterRight.min && afterPan.max !== afterRight.max,
  "dragging the selected window did not pan the X domain",
);
assert.equal(afterPan.points, fullDomain.points, "pan changed source point count");

await page.screenshot({ path: `${out}/snapshot-graph-zoom-1600.png`, fullPage: true });
await page.setViewportSize({ width: 1280, height: 900 });
await page.waitForTimeout(200);
assert.deepEqual(await readDomain(), afterPan, "resize reset the graph zoom");
await page.screenshot({ path: `${out}/snapshot-graph-zoom-1280.png`, fullPage: true });
await page.setViewportSize({ width: 760, height: 900 });
await page.waitForTimeout(200);
assert.deepEqual(await readDomain(), afterPan, "responsive resize reset the graph zoom");
await page.screenshot({ path: `${out}/snapshot-graph-zoom-760.png`, fullPage: true });

await page.getByTestId("workspace-tab-1").locator(".kpi-tab-label").click();
await page.getByTestId("workspace-tab-1").waitFor();
assert.equal(await page.getByTestId("workspace-tab-1").getAttribute("aria-selected"), "true");
await page.getByTestId("workspace-tab-0").locator(".kpi-tab-label").click();
await page.getByTestId("metric-time-plot").waitFor();
await page.waitForTimeout(300);
const workspaceDomain = await readDomain();
assert.deepEqual(workspaceDomain, afterPan, "workspace switch reset the graph zoom");

await page.reload({ waitUntil: "domcontentloaded" });
await page.getByTestId("metric-time-plot").waitFor();
await page.waitForTimeout(300);
const plotReloaded = page.getByTestId("metric-time-plot");
const reloadedDomain = {
  start: Number(await plotReloaded.getAttribute("data-zoom-start")),
  end: Number(await plotReloaded.getAttribute("data-zoom-end")),
  min: Number(await plotReloaded.getAttribute("data-x-min")),
  max: Number(await plotReloaded.getAttribute("data-x-max")),
  points: Number(await plotReloaded.getAttribute("data-n-points")),
};
assert.deepEqual(reloadedDomain, afterPan, "refresh did not restore panel zoom");

const graphArticle = plotReloaded.locator("xpath=ancestor::article[@data-metric-code]");
await graphArticle.getByTestId("workspace-panel-menu").click();
const resetZoom = page.getByTestId("metric-reset-zoom");
assert.equal(await resetZoom.isEnabled(), true);
await resetZoom.click();
await page.waitForTimeout(150);
const resetDomain = {
  min: Number(await plotReloaded.getAttribute("data-x-min")),
  max: Number(await plotReloaded.getAttribute("data-x-max")),
  points: Number(await plotReloaded.getAttribute("data-n-points")),
};
assert.deepEqual(resetDomain, {
  min: fullDomain.min,
  max: fullDomain.max,
  points: fullDomain.points,
});

const zoomStorage = await page.evaluate(
  ({ tabId, panelId }) => localStorage.getItem(`bc4.metric-zoom.v1.${tabId}.${panelId}`),
  { tabId: workspaceId, panelId: graphPanelId },
);
assert.equal(zoomStorage, null, "Reset Zoom did not clear persisted zoom");

const report = {
  base,
  projectId,
  captureId,
  metric,
  rowLayout,
  initialOrder,
  reordered,
  syncedSnapshot,
  fullDomain,
  afterLeft,
  afterRight,
  afterPan,
  workspaceDomain,
  reloadedDomain,
  resetDomain,
  consoleErrors,
  apiErrors,
};
await writeFile(`${out}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
assert.deepEqual(apiErrors, [], `API errors: ${JSON.stringify(apiErrors)}`);
assert.deepEqual(consoleErrors, [], `console errors: ${JSON.stringify(consoleErrors)}`);
await browser.close();
