import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import assert from "node:assert/strict";
const out = "kpi-multigraph-evidence";
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
  await page.getByRole("switch", { name: "Multi-graphes", exact: true }).uncheck();
  assert.equal(await page.locator(".kpi-graph-card").count(), 1);
  await page.getByRole("switch", { name: "Multi-graphes", exact: true }).check();
  assert.equal(await page.locator(".kpi-graph-card").count(), 3);
  const countBefore = requests.length;
  for (const layout of ["1", "2", "4"]) {
    await page.getByLabel("Disposition", { exact: true }).selectOption(layout);
    assert.equal(await page.locator(".kpi-graph-grid").getAttribute("data-layout"), layout);
  }
  await page.getByLabel("Disposition", { exact: true }).selectOption("2");
  assert.equal(requests.length, countBefore);
  await page.getByRole("button", { name: "Ajouter une métrique", exact: true }).click();
  assert(await search.evaluate((n) => document.activeElement === n));
  await page.getByRole("button", { name: "Zone géographique", exact: true }).click();
  assert(await page.getByRole("switch", { name: "Activer DOR", exact: true }).isDisabled());
  await page.keyboard.press("Escape");
  // Draft operator changes must not query; only Apply can update the population.
  await page.getByRole("button", { name: /Opérateur —/ }).click();
  await page.getByRole("checkbox", { name: "Orange", exact: true }).check();
  await page.keyboard.press("Escape");
  await page.getByText("Modifications non appliquées", { exact: true }).waitFor();
  assert.equal(requests.length, countBefore);
  await page.getByRole("button", { name: "Appliquer les filtres", exact: true }).click();
  await page.waitForTimeout(1500);
  assert(
    requests
      .slice(countBefore)
      .every((url) => new URL(url).searchParams.get("operator") === "Orange"),
  );
  assert(requests.length > countBefore);
  report.appliedRequests = requests.slice(countBefore).length;
  assert((await page.locator(".kpi-data-table tbody").innerText()).includes("Orange"));
  assert(!(await page.locator(".kpi-data-table tbody").innerText()).includes("Bouygues"));
  await page.getByRole("button", { name: "Réinitialiser", exact: true }).click();
  await page.getByRole("button", { name: "Appliquer les filtres", exact: true }).click();
  await page.waitForTimeout(700);
  await page.locator(".kpi-analysis-scroll").evaluate((n) => (n.scrollTop = 0));
  await page.screenshot({ path: out + "/desktop.png", fullPage: true });
  await page.locator(".kpi-data-table").scrollIntoViewIfNeeded();
  await page.screenshot({ path: out + "/data.png", fullPage: true });

  // Card actions and tabs operate on the same ordered selection.
  await page
    .getByRole("button", { name: "Actions LTE RRC Connection Attempts", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Déplacer après", exact: true }).click();
  assert.equal(
    await page.locator(".kpi-graph-card").first().getAttribute("data-code"),
    "LTE_RRC_SETUP_COUNT",
  );
  await page
    .getByRole("button", { name: "Infos LTE RRC Connection Attempts", exact: true })
    .click();
  await page
    .getByText("Définition et preuves du catalogue et de la réponse API.", { exact: true })
    .waitFor();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Plein écran LTE RRC Connection Attempts", exact: true })
    .click();
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Fermer LTE_RRC_SETUP_COUNT", exact: true }).click();
  assert.equal(await page.locator(".kpi-graph-card").count(), 2);
  const csvDownload = page.waitForEvent("download");
  await page
    .locator(".kpi-data-table")
    .getByRole("button", { name: "Exporter CSV", exact: true })
    .click();
  const download = await csvDownload;
  assert(fs.readFileSync(await download.path(), "utf8").includes("LTE_RRC_ATTEMPTS"));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  report.mobilePanels = await page
    .locator(".kpi-workspace-panels, #kpi-catalog-panel, .kpi-catalog, #kpi-analysis-panel")
    .evaluateAll((nodes) =>
      nodes.map((n) => ({
        id: n.id,
        cls: n.className,
        rect: { height: n.getBoundingClientRect().height, width: n.getBoundingClientRect().width },
        style: n.getAttribute("style"),
        computed: getComputedStyle(n).cssText,
        display: getComputedStyle(n).display,
        flex: getComputedStyle(n).flex,
      })),
    );
  await page.screenshot({ path: out + "/mobile.png", fullPage: true });
  assert((await page.locator("#kpi-catalog-panel").boundingBox()).height >= 230);
  report.mobileOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  assert.equal(report.mobileOverflow, false);
  await page.setViewportSize({ width: 1720, height: 1080 });
  report.consoleErrors = errors;
  assert.equal(errors.length, 0);
  report.live = "PASS";
  // Controlled contract fixtures for states unavailable in the real project.
  // These exist only in the browser test; they never enter application data.
  const fixtureCodes = [
    "ZERO",
    "PENDING",
    "UNVALIDATED",
    "UNAVAILABLE",
    "EMPTY",
    "ERROR",
    "SLOW",
    "MANY",
  ];
  const makeDetail = (code) => ({
    code,
    name: "Fixture " + code,
    techno: "LTE",
    family: "Qualité radio",
    nature: "Mesure",
    unit: "dBm",
    formula: null,
    source: "test fixture",
    status: ["PENDING", "UNVALIDATED", "UNAVAILABLE"].includes(code) ? code : "AVAILABLE",
    reason: code === "ZERO" ? null : "Fixture reason",
    n: 2,
    result_id: "proof-" + code,
    groups:
      code === "EMPTY"
        ? []
        : [
            { operator: "Orange", band: "B1", n: 1, p50: 0 },
            { operator: "SFR", band: "B3", n: 1, p50: null },
          ],
  });
  let errorAttempts = 0;
  let allowRecovery = false;
  const fixtureRequests = [],
    aborted = [];
  page.on("requestfailed", (r) => {
    if (r.url().includes("/kpi/")) aborted.push(r.url());
  });
  await page.route("**/api/projects/134af70a06eb/kpi/**", async (route) => {
    const url = new URL(route.request().url()),
      code = url.pathname.split("/").at(-1);
    let body;
    if (code === "catalog")
      body = {
        project_id: "134af70a06eb",
        catalog_version: "test",
        tree: [
          {
            techno: "LTE",
            families: [{ family: "Qualité radio", kpis: fixtureCodes.map(makeDetail) }],
          },
        ],
      };
    else if (code === "filters")
      body = {
        operators: { available: true, values: ["Orange", "SFR"] },
        rats: { available: true, values: ["LTE", "NR"] },
        bands: { available: true, values: ["B1", "B3"] },
        dor: { available: true, values: ["Nord"] },
      };
    else {
      fixtureRequests.push(url.toString());
      if (code === "ERROR") errorAttempts++;
      if (code === "ERROR" && !allowRecovery) {
        await route.fulfill({ status: 500, json: { detail: { message: "Fixture API failure" } } });
        return;
      }
      if (code === "SLOW" || url.searchParams.get("band") === "B1")
        await new Promise((resolve) => setTimeout(resolve, 700));
      body = makeDetail(code);
      if (code === "MANY")
        body.groups = Array.from({ length: 60 }, (_, i) => ({
          operator: "Orange",
          band: "B" + i,
          n: 1,
          p50: i,
        }));
      if (url.searchParams.has("band"))
        body.groups = [
          {
            operator: "Orange",
            band: url.searchParams.get("band"),
            n: 1,
            p50: url.searchParams.get("band") === "B1" ? 91 : 92,
          },
        ];
    }
    try {
      await route.fulfill({ json: body });
    } catch {}
  });
  await page.goto(
    "http://localhost:5174/kpi?kpis=" + encodeURIComponent(JSON.stringify(fixtureCodes)),
    { waitUntil: "domcontentloaded" },
  );
  await page.locator('[data-code="SLOW"][data-status="Loading"]').waitFor();
  await page.locator('[data-code="SLOW"][data-status="Available"]').waitFor();
  for (const [code, status] of Object.entries({
    ZERO: "Available",
    PENDING: "Pending",
    UNVALIDATED: "Unvalidated",
    UNAVAILABLE: "Unavailable",
    EMPTY: "Empty",
    ERROR: "Error",
  })) {
    assert.equal(
      await page.locator('[data-code="' + code + '"]').getAttribute("data-status"),
      status,
    );
  }
  report.errorAttemptsBeforeRetry = errorAttempts;
  allowRecovery = true;
  await page
    .locator('[data-code="ERROR"]')
    .getByRole("button", { name: "Réessayer", exact: true })
    .click();
  await page.locator('[data-code="ERROR"][data-status="Available"]').waitFor();
  assert.equal(errorAttempts, report.errorAttemptsBeforeRetry + 1);
  const table = page.locator(".kpi-data-table");
  await page
    .getByRole("textbox", { name: "Rechercher dans les données", exact: true })
    .fill("Fixture ZERO");
  assert.equal(await table.locator("tbody tr").count(), 2);
  assert((await table.locator("tbody").innerText()).includes("proof-ZERO"));
  assert((await table.locator("tbody").innerText()).includes("—"));
  await table.locator("tbody input[type=checkbox]").first().check();
  assert.equal(await table.locator("tbody tr.selected").count(), 1);
  await table.getByRole("button", { name: "Colonnes", exact: true }).click();
  await page.getByRole("checkbox", { name: "Population (n)", exact: true }).uncheck();
  await page.keyboard.press("Escape");
  assert.equal(
    await table.getByRole("columnheader", { name: "Population (n)", exact: true }).count(),
    0,
  );
  const beforeLayout = fixtureRequests.length;
  await page.getByLabel("Disposition", { exact: true }).selectOption("4");
  assert.equal(fixtureRequests.length, beforeLayout);
  const positions = await page
    .locator(".kpi-graph-card")
    .evaluateAll((nodes) =>
      nodes
        .slice(0, 4)
        .map((n) => ({ x: n.getBoundingClientRect().x, y: n.getBoundingClientRect().y })),
    );
  assert(positions.every((p) => Math.abs(p.y - positions[0].y) < 2));
  assert(new Set(positions.map((p) => p.x)).size === 4);
  report.fourColumns = "PASS";
  await page
    .getByRole("textbox", { name: "Rechercher dans les données", exact: true })
    .fill("Fixture MANY");
  assert.equal(await table.locator("tbody tr").count(), 25);
  await table.getByRole("button", { name: "Page suivante", exact: true }).click();
  assert((await table.locator("footer").innerText()).includes("2 / 3"));
  await page
    .getByRole("textbox", { name: "Rechercher dans les données", exact: true })
    .fill("Fixture ZERO");
  await table.getByRole("button", { name: "Valeur", exact: true }).click();
  assert.equal(
    await table.getByRole("columnheader", { name: /Valeur/ }).getAttribute("aria-sort"),
    "ascending",
  );
  // Two successive applied populations: the delayed B1 response must never overwrite B3.
  for (const band of ["B1", "B3"]) {
    await page.getByRole("button", { name: /^Bande —/ }).click();
    if (band === "B3") await page.getByRole("checkbox", { name: "B1", exact: true }).uncheck();
    await page.getByRole("checkbox", { name: band, exact: true }).check();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Appliquer les filtres", exact: true }).click();
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(1000);
  assert((await table.locator("tbody").innerText()).includes("92"));
  assert(!(await table.locator("tbody").innerText()).includes("91"));
  assert(aborted.length > 0);
  const geoRequests = fixtureRequests.length;
  await page.getByRole("button", { name: "Zone géographique", exact: true }).click();
  await page.getByRole("switch", { name: "Activer DOR", exact: true }).check();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^DOR —/ }).click();
  await page.getByRole("checkbox", { name: "Nord", exact: true }).check();
  await page.keyboard.press("Escape");
  assert.equal(fixtureRequests.length, geoRequests);
  await page.getByRole("button", { name: "Appliquer les filtres", exact: true }).click();
  await page.waitForTimeout(200);
  assert(
    fixtureRequests
      .slice(geoRequests)
      .every((url) => new URL(url).searchParams.get("dor") === "Nord"),
  );
  await page.getByRole("button", { name: /^Zone géographique/ }).click();
  await page.getByRole("switch", { name: "Activer DOR", exact: true }).uncheck();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Appliquer les filtres", exact: true }).click();
  await page.waitForTimeout(200);
  assert(!new URL(page.url()).searchParams.has("dor"));
  report.fixture = {
    states: "PASS",
    retry: "PASS",
    nullZeroEvidence: "PASS",
    columnsSelection: "PASS",
    cachedLayout: "PASS",
    obsoleteRequestsCancelled: aborted.length,
  };
  assert.equal(errors.length, 0);
} catch (error) {
  report.live = "FAIL";
  report.error = error.stack;
  await page.screenshot({ path: out + "/failure.png", fullPage: true });
} finally {
  fs.writeFileSync(out + "/browser-report.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
}
if (report.live !== "PASS") process.exitCode = 1;
