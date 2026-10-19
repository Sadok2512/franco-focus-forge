import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import assert from "node:assert/strict";
const out = "kpi-compact-evidence";
fs.mkdirSync(out, { recursive: true });
// Credentials remain in the API container; neither credentials nor session are logged/saved.
const session = JSON.parse(
  execFileSync(
    "docker",
    [
      "exec",
      "bc4-api-1",
      "python",
      "-c",
      `
import os,json,httpx
c=httpx.Client(base_url="http://localhost:8000")
r=c.post("/auth/login",json={"email":os.environ["BC4_ADMIN_EMAIL"],"password":os.environ["BC4_ADMIN_PASSWORD"]})
r.raise_for_status()
s=r.json()
s["user"]=c.get("/auth/me",headers={"Authorization":"Bearer "+s["token"]}).json()
print(json.dumps(s))
`,
    ],
    { encoding: "utf8" },
  ),
);
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1720, height: 1080 } });
const errors = [],
  requests = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (r) => {
  if (/\/kpi\/[^/?]+\?/.test(r.url())) requests.push(r.url());
});
await page.addInitScript(
  (s) => {
    localStorage.setItem("bc4.session", JSON.stringify(s));
    localStorage.setItem(
      "bc4.activeProject.v1." + s.user.email,
      JSON.stringify({ id: "134af70a06eb", name: "TEST2" }),
    );
  },
  { ...session, expires_at: session.expires_at ?? new Date(Date.now() + 3600000).toISOString() },
);
const report = {};
try {
  await page.goto("http://localhost:5174/kpi", { waitUntil: "networkidle" });
  await page
    .getByRole("textbox", { name: "Rechercher un KPI", exact: true })
    .waitFor({ timeout: 60000 });
  await page.locator('.kpi-graph-card[data-status="Available"]').first().waitFor();
  const search = page.getByRole("textbox", { name: "Rechercher un KPI", exact: true });
  for (const code of ["LTE_RRC_SETUP_COUNT", "LTE_RRC_SUCCESS"]) {
    await search.fill(code);
    await page.locator(".kpi-tree input[type=checkbox]").first().check();
  }
  await search.fill("");
  await page.waitForTimeout(1200);
  assert.equal(await page.locator(".kpi-graph-card").count(), 3);
  assert((await page.locator(".kpi-data-table tbody").innerText()).includes("B3"));
  report.actualCodes = await page
    .locator(".kpi-graph-card")
    .evaluateAll((nodes) => nodes.map((n) => n.dataset.code));
  report.sidebarRoots = await page.locator(".kpi-tree-root").allTextContents();
  assert.equal(report.sidebarRoots.length, 4);
  const handle = page.getByRole("separator", { name: "Redimensionner le catalogue KPI" });
  const before = (await page.locator("#kpi-catalog-panel").boundingBox()).width;
  const box = await handle.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 75, box.y + 100);
  await page.mouse.up();
  const after = (await page.locator("#kpi-catalog-panel").boundingBox()).width;
  assert(after > before && after <= 460);
  report.resize = { before, after };

  assert.equal(await page.getByRole("switch", { name: "Multi-graphes", exact: true }).count(), 0);
  assert.equal(await page.getByRole("switch", { name: "Carte / Infos", exact: true }).count(), 0);
  const filters = await page.locator(".kpi-filterbar").boundingBox();
  const sidebar = await page.locator("#kpi-catalog-panel").boundingBox();
  assert(filters.y + filters.height <= sidebar.y);
  assert(filters.width > sidebar.width * 2);
  report.filters = filters;
  const countBefore = requests.length;
  await page.getByRole("button", { name: /Opérateur —/ }).click();
  await page.getByRole("checkbox", { name: "Orange", exact: true }).check();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: /Opérateur — Orange/ })
    .getByTitle("Orange", { exact: true })
    .waitFor();
  await page.getByText("Modifications non appliquées", { exact: true }).waitFor();
  await page.waitForTimeout(500);
  assert.equal(requests.length, countBefore);
  await page.getByRole("button", { name: "Appliquer les filtres", exact: true }).click();
  await page.waitForTimeout(1500);
  assert(requests.length > countBefore);
  assert(
    requests
      .slice(countBefore)
      .every((url) => new URL(url).searchParams.get("operator") === "Orange"),
  );
  const appliedBadge = page.locator(".kpi-applied-chips").getByTitle("Orange", { exact: true });
  await appliedBadge.waitFor();
  assert.equal(
    await appliedBadge.evaluate((node) => getComputedStyle(node).backgroundColor),
    await page
      .getByRole("button", { name: /Opérateur — Orange/ })
      .getByTitle("Orange", { exact: true })
      .evaluate((node) => getComputedStyle(node).backgroundColor),
  );
  await page.screenshot({ path: out + "/selected-operator.png", fullPage: true });
  report.selectedOperatorBadges = "PASS";
  report.explicitApply = "PASS";
  await page.getByRole("button", { name: "Réinitialiser", exact: true }).click();
  await page.getByRole("button", { name: "Appliquer les filtres", exact: true }).click();
  await page.waitForTimeout(800);
  report.viewports = [];
  for (const [width, height] of [
    [1920, 1080],
    [1440, 900],
    [1280, 800],
    [400, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.locator(".kpi-analysis-scroll").evaluate((n) => (n.scrollTop = 0));
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const boxes = await page.locator(".kpi-graph-card").evaluateAll((nodes) =>
      nodes.map((n) => {
        const r = n.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width };
      }),
    );
    if (width >= 1280) {
      const tabs = await page.locator(".kpi-graph-tabs").boundingBox();
      const controls = await page.locator(".kpi-workspace-controls").boundingBox();
      assert(Math.abs(tabs.y + tabs.height / 2 - (controls.y + controls.height / 2)) < 2);
      assert(controls.x >= tabs.x + tabs.width);

      assert(Math.abs(boxes[0].y - boxes[1].y) < 2);
      assert(boxes[2].width > boxes[0].width * 1.9);
    } else assert(boxes[1].y > boxes[0].y);
    report.viewports.push({ width, height, boxes });
    await page.screenshot({ path: out + "/" + width + ".png", fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Fermer LTE_RRC_SUCCESS", exact: true }).click();
  assert.equal(await page.locator(".kpi-graph-card").count(), 2);
  const pair = await page
    .locator(".kpi-graph-card")
    .evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().y));
  assert(Math.abs(pair[0] - pair[1]) < 2);
  await page.getByRole("button", { name: "Fermer LTE_RRC_SETUP_COUNT", exact: true }).click();
  assert.equal(await page.locator(".kpi-graph-card").count(), 1);
  const graph = await page.locator(".kpi-graph-card").boundingBox();
  const grid = await page.locator(".kpi-graph-grid").boundingBox();
  assert(Math.abs(graph.width - grid.width) < 2);
  await page
    .getByRole("button", { name: "Infos LTE RRC Connection Attempts", exact: true })
    .click();
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  const csvDownload = page.waitForEvent("download");
  await page
    .locator(".kpi-data-table")
    .getByRole("button", { name: "Exporter CSV", exact: true })
    .click();
  assert(fs.readFileSync(await (await csvDownload).path(), "utf8").includes("LTE_RRC_ATTEMPTS"));
  // Deliberately invalid response only in this test browser, never in application data.
  await page.route("**/kpi/LTE_RRC_ATTEMPTS?*", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.n = null;
    await route.fulfill({ response, json: body });
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.getByText("Données indisponibles", { exact: true }).waitFor();
  await page.getByText("Voir le détail technique", { exact: true }).click();
  assert((await page.locator(".kpi-error-details").innerText()).includes("null"));
  await search.fill("LTE_RRC_SETUP_COUNT");
  await page.locator(".kpi-tree input[type=checkbox]").first().check();
  await page
    .locator('.kpi-graph-card[data-code="LTE_RRC_SETUP_COUNT"][data-status="Available"]')
    .waitFor();
  assert.equal(await page.locator('.kpi-graph-card[data-status="Error"]').count(), 1);
  await page.screenshot({ path: out + "/error.png", fullPage: true });
  await page.unroute("**/kpi/LTE_RRC_ATTEMPTS?*");
  await page.getByRole("button", { name: "Réessayer", exact: true }).click();
  await page.locator('.kpi-graph-card[data-status="Available"]').waitFor();
  report.errorRecovery = "PASS";
  report.consoleErrors = errors;
  assert.equal(errors.length, 0);
  report.result = "PASS";
} catch (error) {
  report.failure = error.stack;
  await page.screenshot({ path: out + "/failure.png", fullPage: true });
  process.exitCode = 1;
} finally {
  fs.writeFileSync(out + "/browser.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
}
