import assert from "node:assert/strict";
import { chromium } from "playwright";
import fs from "node:fs";
const out = "/tmp/bc4-rrc-hierarchy";
fs.mkdirSync(out, { recursive: true });
const login = await fetch("http://localhost:8000/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: "admin@bc4.local",
    password: process.env.RRC_TEST_PASSWORD || "ChangeMeAdmin123!",
  }),
}).then((r) => r.json());
if (!login.token) throw Error("Local test login unavailable");
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  permissions: ["clipboard-read", "clipboard-write"],
});
const page = await context.newPage();
const errors = [];
const responses = [];
page.on("response", async (response) => {
  if (response.url().includes("/dict/v2/distribution") && response.ok())
    responses.push(await response.json());
});
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(
  (session) => localStorage.setItem("bc4.session", JSON.stringify(session)),
  {
    ...login,
    user: {
      id: "adm-30bf55313911",
      email: "admin@bc4.local",
      role: "admin",
      active: true,
      created_at: "2026-10-15T14:22:08Z",
    },
    expires_at: new Date(Date.now() + 3600000).toISOString(),
  },
);
await page.addInitScript(() => performance.setResourceTimingBufferSize(10000));
page.setDefaultTimeout(60000);
page.setDefaultNavigationTimeout(60000);
await page.goto("http://localhost:5174/projects", { waitUntil: "networkidle" });
await page
  .locator("tr", { hasText: "Test_3" })
  .first()
  .getByRole("button", { name: "Ouvrir", exact: true })
  .click();
await page.locator("nav a", { hasText: "Dictionnaire RRC" }).first().click();
await page.getByTestId("dict-tree-search").waitFor();

const report = {};
const requests = [];
page.on("request", (r) => {
  if (r.url().includes("/dict/v2/distribution")) requests.push(r.url());
});
await page.getByRole("tab", { name: "Raw parameter", exact: true }).click();
for (const [name, count] of [
  ["a2-Threshold", 3098],
  ["a3-Offset", 1129],
]) {
  await page.getByTestId("dict-tree-search").fill(name);
  await page
    .getByTestId("dict-raw-leaf-" + name)
    .first()
    .locator("input[type=checkbox]")
    .check();
  await page.waitForFunction(
    (name) =>
      document.querySelectorAll('[data-testid^="dict-chart-"]').length >=
      (name === "a2-Threshold" ? 1 : 2),
    name,
  );
}
await page.getByTestId("dict-tree-search").fill("");
await page.waitForFunction(() => document.querySelectorAll("[data-row-kind=value]").length === 8);
const sumTable = () =>
  page.locator("[data-row-kind=value]").evaluateAll((nodes) =>
    nodes.reduce((sum, n) => {
      const key = n.dataset.parameterId;
      sum[key] = (sum[key] || 0) + Number(n.lastElementChild.textContent.replace(/\s/g, ""));
      return sum;
    }, {}),
  );
async function histogramTotals() {
  await page.locator('[data-testid^="dict-chart-"] canvas').nth(1).waitFor();
  return page.evaluate(async () => {
    const url = performance
      .getEntriesByType("resource")
      .map((r) => r.name)
      .find((url) => url.includes("/echarts.js"));
    const moduleUrl =
      url ??
      (await (await fetch("/src/components/bc4/Chart.tsx")).text()).match(
        /import\("([^" ]*echarts\.js[^" ]*)"\)/,
      )?.[1];
    if (!moduleUrl) throw Error("ECharts module not loaded");
    const charts = await import(moduleUrl);
    return Object.fromEntries(
      [...document.querySelectorAll("[_echarts_instance_]")].map((node) => [
        node
          .closest('[data-testid^="dict-chart-"]')
          .getAttribute("data-testid")
          .replace("dict-chart-", ""),
        charts
          .getInstanceByDom(node)
          .getOption()
          .series.reduce(
            (sum, s) => sum + s.data.reduce((n, v) => n + (typeof v === "number" ? v : 0), 0),
            0,
          ),
      ]),
    );
  });
}
report.baseline = await sumTable();
report.histograms = await histogramTotals();
assert.deepEqual(report.histograms, { "a2-Threshold": 3098, "a3-Offset": 1129 });
for (const [name, n] of [
  ["a2-Threshold", 3098],
  ["a3-Offset", 1129],
])
  assert.ok((await page.getByTestId("dict-chart-" + name).innerText()).includes("n=" + n));
assert.deepEqual(
  Object.values(report.baseline).sort((a, b) => a - b),
  [1129, 3098],
);
assert.ok(requests.every((url) => !decodeURIComponent(url).includes("/[0]/")));
report.rawMapping = "PASS";
let initial = requests.length;
await page.getByRole("button", { name: "Opérateur — Tous", exact: true }).click();
await page.getByRole("checkbox", { name: "Orange", exact: true }).check();
await page.keyboard.press("Escape");
await page.getByRole("radio", { name: "LTE", exact: true }).click();
await page.getByRole("button", { name: "Bande — Tous", exact: true }).click();
await page.getByRole("checkbox", { name: "B1", exact: true }).check();
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
assert.equal(requests.length, initial);
assert.deepEqual(await sumTable(), report.baseline);
report.draft = "PASS";
await page.getByRole("tab", { name: "Paramètres", exact: true }).click();
await page.getByTestId("dict-tree-search").fill("highSpeedFlag");
await page.getByTestId("dict-leaf-highSpeedFlag").first().locator("input[type=checkbox]").check();
await page.waitForFunction(
  () => document.querySelectorAll('[data-testid^="dict-chart-"]').length === 3,
);
const duringDraft = await sumTable();
for (const [key, count] of Object.entries(report.baseline)) assert.equal(duringDraft[key], count);
assert.equal(
  await page.getByRole("button", { name: "Appliquer les filtres", exact: true }).isEnabled(),
  true,
);
await page.getByTestId("dict-leaf-highSpeedFlag").first().locator("input[type=checkbox]").uncheck();
await page.waitForFunction(
  () => document.querySelectorAll('[data-testid^="dict-chart-"]').length === 2,
);
await page.getByTestId("dict-tree-search").fill("");
await page.getByTestId("dict-groupby-band").click();
await page.waitForFunction(
  () =>
    document.querySelector('[data-testid="dict-groupby-band"]')?.getAttribute("aria-pressed") ===
    "true",
);
assert.deepEqual(await sumTable(), report.baseline);
await page.getByTestId("dict-groupby-operator").click();
await page.waitForFunction(
  () =>
    document
      .querySelector('[data-testid="dict-groupby-operator"]')
      ?.getAttribute("aria-pressed") === "true",
);
report.selectionPending = "PASS";
initial = requests.length;

await page.getByRole("button", { name: "Appliquer les filtres", exact: true }).click();
await page.waitForURL((url) => url.searchParams.has("band"));
await page.waitForFunction(
  () =>
    !document.querySelector(".rrc-analysis-scroll")?.textContent.includes("actualisation en cours"),
);
await page.waitForTimeout(200);
report.filtered = await sumTable();
report.filteredHistograms = await histogramTotals();
assert.deepEqual(report.filteredHistograms, { "a2-Threshold": 77, "a3-Offset": 31 });
for (const [name, n] of [
  ["a2-Threshold", 77],
  ["a3-Offset", 31],
])
  assert.ok((await page.getByTestId("dict-chart-" + name).innerText()).includes("n=" + n));
assert.equal(requests.length, initial + 1);
const beforeReset = requests.length;
await page.getByRole("button", { name: "Réinitialiser", exact: true }).first().click();
await page.waitForTimeout(100);
assert.equal(requests.length, beforeReset);
assert.deepEqual(await sumTable(), report.filtered);
assert.equal(
  await page.getByRole("button", { name: "Appliquer les filtres", exact: true }).isEnabled(),
  true,
);
await page.getByRole("button", { name: "Appliquer les filtres", exact: true }).click();
await page.waitForFunction(() => document.querySelectorAll("[data-row-kind=value]").length === 8);
assert.deepEqual(await sumTable(), report.baseline);
report.reset = "PASS";
report.sizes = [];
for (const [width, height] of [
  [1920, 1080],
  [1440, 900],
  [1280, 800],
  [400, 900],
]) {
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(100);
  const metrics = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    toolbar: document.querySelector(".rrc-toolbar").getBoundingClientRect().height,
    bodyWidth: document.documentElement.scrollWidth,
    rootHeight: document.querySelector(".rrc-workstation").getBoundingClientRect().height,
  }));
  report.sizes.push(metrics);
  console.log("metrics", metrics);
  assert.ok(metrics.bodyWidth <= width);
  if (width >= 1280) assert.ok(metrics.toolbar <= 110);
}

await page.setViewportSize({ width: 1440, height: 900 });
let release;
const gate = new Promise((resolve) => (release = resolve));
let intercepted = 0;
await page.route("**/dict/v2/distribution*", async (route) => {
  intercepted++;
  const first = intercepted === 1;
  const response = await route.fetch();
  const json = await response.json();
  if (first) await gate;
  await route.fulfill({ json }).catch(() => {});
});
async function choose(label, value) {
  await page.locator(".rrc-toolbar button").filter({ hasText: label }).count();
  await page.locator(`.rrc-toolbar button[aria-label^="${label} —"]`).click();
  const pop = page
    .locator('.rrc-premium-popover[data-state="open"]')
    .filter({ has: page.getByRole("textbox", { name: "Rechercher " + label, exact: true }) });
  await pop.getByRole("button", { name: "Effacer", exact: true }).click();
  await pop.getByRole("checkbox", { name: value, exact: true }).check();
  await page.keyboard.press("Escape");
  await pop.waitFor({ state: "hidden" });
}
await choose("Opérateur", "Orange");
await choose("Bande", "B3");
await page.getByRole("button", { name: "Appliquer les filtres", exact: true }).click();
await page.waitForURL((url) => url.searchParams.get("band")?.includes("B3"));
await choose("Opérateur", "Free");
await choose("Bande", "B7");
await page.getByRole("button", { name: "Appliquer les filtres", exact: true }).click();
await page.waitForFunction(
  () => document.querySelector("[data-row-kind=value] td:last-child")?.textContent === "378",
);
const newer = await sumTable();
assert.deepEqual(
  Object.values(newer).sort((a, b) => a - b),
  [191, 378],
);
release();
await page.waitForTimeout(300);
assert.deepEqual(await sumTable(), newer);
assert.equal(intercepted, 2);
report.staleResponses = "PASS";
await page.unroute("**/dict/v2/distribution*");
await page.getByRole("button", { name: "Réinitialiser", exact: true }).first().click();
await page.getByRole("button", { name: "Appliquer les filtres", exact: true }).click();
await page.waitForFunction(() => document.querySelectorAll("[data-row-kind=value]").length === 8);
await page.locator(".rrc-populations summary").click();
await page.waitForTimeout(1200);
await page.screenshot({ path: "/tmp/rrc-sync-desktop.png", fullPage: true });
await page.locator(".rrc-toolbar").screenshot({ path: "/tmp/rrc-sync-toolbar.png" });

// Isolated request failure: keep and label the previous valid population.
await page.route("**/dict/v2/distribution*", (route) =>
  route.fulfill({ status: 503, json: { detail: "Test indisponibilité" } }),
);
await choose("Opérateur", "SFR");
await choose("Bande", "B20");
await page.getByRole("button", { name: "Appliquer les filtres", exact: true }).click();
await page.waitForFunction(() =>
  document.querySelector(".rrc-context-notice")?.textContent.includes("chargement échoué"),
);
assert.deepEqual(await sumTable(), report.baseline);
report.failureContext = "PASS";
await page.unroute("**/dict/v2/distribution*");
await page.getByRole("button", { name: "Réinitialiser", exact: true }).first().click();
await page.getByRole("button", { name: "Appliquer les filtres", exact: true }).click();

// Browser-only metadata fixture exercises unavailable live DOR controls without inventing production mappings.
await page.route("**/dict/v2/filters", async (route) => {
  const result = await (await route.fetch()).json();
  result.geographic = result.geographic.map((d) =>
    d.key === "dor"
      ? { ...d, available: true, reason: null, options: ["Dimension de test"], count: 1 }
      : d,
  );
  await route.fulfill({ json: result });
});
await page.reload({ waitUntil: "networkidle" });
for (const name of ["a2-Threshold", "a3-Offset"]) {
  await page.getByTestId("dict-tree-search").fill(name);
  await page
    .getByTestId("dict-leaf-" + name)
    .first()
    .locator("input[type=checkbox]")
    .check();
}
await page.waitForFunction(() => document.querySelectorAll("[data-row-kind=value]").length === 8);
const beforeGeo = requests.length;
await page.getByRole("button", { name: "Zone géographique — Toutes", exact: true }).click();
await page.getByRole("switch", { name: "Activer DOR", exact: true }).focus();
await page.keyboard.press("Space");
await page.keyboard.press("Escape");
await page.getByRole("button", { name: "DOR — Tous", exact: true }).click();
await page.getByRole("checkbox", { name: "Dimension de test", exact: true }).check();
await page.keyboard.press("Escape");
await page.waitForTimeout(100);
assert.equal(requests.length, beforeGeo);
await page.getByRole("button", { name: "DOR — 1 sélectionné(s)", exact: true }).click();
await page
  .locator('.rrc-premium-popover[data-state="open"]')
  .getByRole("button", { name: "Effacer", exact: true })
  .click();
await page.keyboard.press("Escape");
await page.getByRole("button", { name: "Appliquer les filtres", exact: true }).click();
await page.waitForTimeout(100);
assert.equal(requests.length, beforeGeo);
assert.deepEqual(await sumTable(), report.baseline);
assert.equal(new URL(page.url()).searchParams.has("dor"), false);
await page.getByRole("button", { name: "Zone géographique — Toutes", exact: true }).click();
await page.getByRole("switch", { name: "Activer DOR", exact: true }).focus();
await page.keyboard.press("Space");
await page.keyboard.press("Escape");
await page.getByRole("button", { name: "Appliquer les filtres", exact: true }).click();
assert.deepEqual(await sumTable(), report.baseline);
assert.ok((await page.locator(".rrc-toolbar").boundingBox()).height <= 110);
report.geography =
  "PASS: isolated DOR draft selection sends no analysis; Tous/disabled omit restriction and preserve real baseline counts";
report.requests = requests;
report.errors = errors;
assert.deepEqual(errors, []);
fs.writeFileSync("/tmp/rrc-sync-browser.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
