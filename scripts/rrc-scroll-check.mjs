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
page.setDefaultTimeout(60000);
page.setDefaultNavigationTimeout(60000);
// Cache real metadata only inside this isolated layout test; avoid re-querying the large project for each viewport.
const metadataCache = new Map();
await page.route("**/api/projects/**/dict**", async (route) => {
  const url = route.request().url();
  if (url.includes("/distribution")) return route.continue();
  let cached = metadataCache.get(url);
  if (!cached) {
    const response = await route.fetch({ timeout: 60000 });
    cached = {
      status: response.status(),
      body: await response.body(),
      headers: { "content-type": "application/json" },
    };
    metadataCache.set(url, cached);
  }
  await route.fulfill(cached);
});
await page.goto("http://localhost:5174/projects", { waitUntil: "networkidle" });
await page
  .locator("tr", { hasText: "Test_3" })
  .first()
  .getByRole("button", { name: "Ouvrir", exact: true })
  .click();
await page.locator("nav a", { hasText: "Dictionnaire RRC" }).first().click();
await page.getByTestId("dict-tree-search").waitFor();

const source = JSON.parse(
  fs.readFileSync(new URL("../rrc-sync-evidence/rrc-sync-audit.json", import.meta.url), "utf8"),
).distributions[0].response;
let count = 0;
await page.route("**/dict/v2/distribution*", async (route) => {
  const keys = new URL(route.request().url()).searchParams.get("keys").split(",");
  const selected = source.blocks.filter((b) => keys.includes(b.param_key));
  let offset = 0;
  const blocks = selected.map((b, i) => {
    const size =
      selected.length === 1 ? count : i === 0 ? Math.ceil(count / 2) : Math.floor(count / 2);
    const values = Array.from({ length: size }, (_, j) => ({
      value: String(offset + j),
      value_display: String(offset + j),
      groups: [{ operator: "Orange", band: "B1", n: 1 }],
    }));
    offset += size;
    return { ...b, n_total: size, distinct_values: size, values };
  });
  await route.fulfill({ json: { ...source, blocks } });
});
const report = [];
for (const [width, height] of [
  [1920, 1080],
  [1440, 900],
  [1280, 800],
])
  for (const n of [0, 1, 10, 100, 1000]) {
    count = n;
    await page.setViewportSize({ width, height });
    await page.reload({ waitUntil: "networkidle" });
    for (const name of ["a2-Threshold", "a3-Offset"]) {
      await page.getByTestId("dict-tree-search").fill(name);
      await page
        .getByTestId("dict-leaf-" + name)
        .first()
        .locator("input[type=checkbox]")
        .check();
    }
    await page.getByTestId("dict-tree-search").fill("");
    await page.waitForFunction(
      () => document.querySelectorAll('[data-testid^="dict-chart-"]').length === 2,
    );
    const region = page.locator(".rrc-table-viewport");
    await region.waitFor();
    const tree = page.getByTestId("dict-tree-scroll");
    await tree.evaluate((e) => (e.scrollTop = 100));
    const treeBefore = await tree.evaluate((e) => e.scrollTop);
    const analysis = page.getByTestId("dict-analysis-scroll");
    await analysis.evaluate((e) => (e.scrollTop = e.scrollHeight));
    await region.evaluate((e) => (e.scrollTop = e.scrollHeight));
    await page.waitForTimeout(100);
    if (n > 0)
      await page.waitForFunction(
        (last) =>
          [...document.querySelectorAll(".rrc-hierarchy-value")].some(
            (e) => e.textContent === last,
          ),
        String(n - 1),
      );
    assert.equal(await tree.evaluate((e) => e.scrollTop), treeBefore);
    const handle = await page.getByRole("separator").first().boundingBox();
    const before = (await page.locator("[data-panel]").first().boundingBox()).width;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + 50, handle.y + handle.height / 2, { steps: 5 });
    await page.mouse.up();
    const after = (await page.locator("[data-panel]").first().boundingBox()).width;
    assert.ok(Math.abs(after - before) > 1 || after >= 459);
    await analysis.evaluate((e) => (e.scrollTop = e.scrollHeight));
    await region.evaluate((e) => (e.scrollTop = e.scrollHeight));
    await page.waitForTimeout(100);
    const measured = await page.evaluate(() => {
      const region = document.querySelector(".rrc-table-viewport"),
        last = region.querySelector("tbody tr:last-child"),
        analysis = document.querySelector("[data-testid=dict-analysis-scroll]"),
        card = document.querySelector(".rrc-results");
      return {
        tableHeight: region.clientHeight,
        tableScroll: region.scrollHeight,
        lastGap:
          region.scrollHeight -
          (last.getBoundingClientRect().bottom -
            region.getBoundingClientRect().top +
            region.scrollTop),
        analysisHeight: analysis.clientHeight,
        analysisScroll: analysis.scrollHeight,
        analysisGap:
          analysis.scrollHeight -
          (card.getBoundingClientRect().bottom -
            analysis.getBoundingClientRect().top +
            analysis.scrollTop),
        mounted: region.querySelectorAll("tbody tr").length,
        bodyHeight: document.documentElement.scrollHeight,
        headerTop: region.querySelector("thead").getBoundingClientRect().top,
        viewportTop: region.getBoundingClientRect().top,
        selected: document.querySelector("[data-testid=dict-selected-count]").textContent,
      };
    });
    assert.ok(Math.abs(measured.lastGap) <= 2);
    if (measured.analysisScroll > measured.analysisHeight + 1) assert.ok(measured.analysisGap <= 8);
    assert.match(measured.selected, /2/);
    if (n >= 100) assert.ok(measured.tableScroll > measured.tableHeight);
    if (n <= 1) assert.equal(measured.tableScroll, measured.tableHeight);
    if (n === 1000) assert.ok(measured.mounted < 35);
    report.push({
      width,
      height,
      rows: n,
      sidebarBefore: before,
      sidebarAfter: after,
      ...measured,
    });
    console.log("PASS", width, height, n, measured.lastGap, measured.analysisGap);
    fs.writeFileSync("/tmp/rrc-scroll-validation.json", JSON.stringify(report, null, 2));
  }
// Natural mobile flow has no 1100px allocation, no page-wide horizontal overflow.
count = 1;
await page.setViewportSize({ width: 400, height: 900 });
await page.reload({ waitUntil: "networkidle" });
await page.getByTestId("dict-tree-search").fill("a2-Threshold");
await page.getByTestId("dict-leaf-a2-Threshold").first().locator("input[type=checkbox]").check();
await page.locator(".rrc-table-viewport").waitFor();
assert.equal(
  await page
    .getByRole("button", { name: "Déplier les filtres", exact: true })
    .getAttribute("aria-expanded"),
  "false",
);
const mobile = await page.evaluate(() => ({
  width: document.documentElement.scrollWidth,
  viewport: innerWidth,
  tail:
    document.documentElement.scrollHeight -
    (document.querySelector(".rrc-results").getBoundingClientRect().bottom + scrollY),
}));
assert.equal(mobile.width, 400);
assert.ok(mobile.tail < 25);
report.push({ mobile });
assert.deepEqual(errors, []);
fs.writeFileSync("/tmp/rrc-scroll-validation.json", JSON.stringify(report, null, 2));
await browser.close();
