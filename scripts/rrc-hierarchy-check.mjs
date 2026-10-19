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
await page.goto("http://localhost:5174/projects", { waitUntil: "networkidle" });
await page
  .locator("tr", { hasText: process.env.RRC_PROJECT || "TEST2" })
  .first()
  .getByRole("button", { name: "Ouvrir", exact: true })
  .click();
await page.locator("nav a", { hasText: "Dictionnaire RRC" }).first().click();
await page.getByTestId("dict-tree-search").waitFor();

const report = {};
for (const name of ["highSpeedFlag", "prach-ConfigIndex"]) {
  await page.getByTestId("dict-tree-search").fill(name);
  await page
    .getByTestId("dict-leaf-" + name)
    .first()
    .locator("input[type=checkbox]")
    .check();
}
await page.getByTestId("dict-tree-search").fill("");
const table = page.locator(".rrc-hierarchy");
await table.locator("[data-row-kind=value]").nth(5).waitFor();
await page.locator('[data-testid^="dict-chart-"] canvas').nth(1).waitFor();
assert.equal(await table.locator("[data-row-kind=family]").count(), 1);
assert.equal(await table.locator("[data-row-kind=parameter]").count(), 2);
assert.equal(await table.locator("[data-row-kind=value]").count(), 6);
assert.deepEqual(await table.locator(".rrc-hierarchy-name").allTextContents(), [
  "Accès & timers",
  "highSpeedFlag",
  "prach-ConfigIndex",
]);
assert.deepEqual(await table.locator("thead th").allTextContents(), [
  "Famille / Paramètre / Valeur ↑",
  "Orange ↕",
  "Bouygues ↕",
  "Free ↕",
  "Total ↕",
]);
assert.equal(await table.getByTitle("prach-ConfigIndex · Orange : 39 / 54 · 72,2 %").count(), 1);
assert.equal(await table.getByTitle("prach-ConfigIndex · Free : 4 / 9 · 44,4 %").count(), 1);
assert.equal(await table.getByRole("alert").count(), 0);
report.G1 = report.G2 = report.G3 = report.G4 = "PASS";
const original = responses.at(-1);
const baseline = JSON.parse(
  fs.readFileSync(
    new URL("../rrc-grouped-evidence/distribution-before.json", import.meta.url),
    "utf8",
  ),
);
for (const block of original.blocks) {
  const before = baseline.blocks.find((b) => b.param_key === block.param_key);
  for (const key of [
    "values",
    "n_total",
    "distinct_values",
    "verdict",
    "comparability",
    "result_id",
  ])
    assert.deepEqual(block[key], before[key]);
}
const region = table.getByRole("region", { name: "Valeurs, tableau défilant" });
await table
  .getByRole("button", { name: "Réduire le paramètre prach-ConfigIndex", exact: true })
  .click();
assert.equal(await table.locator("[data-row-kind=value]").count(), 1);
await table.getByLabel("Ordre des valeurs").selectOption("desc");
assert.equal(await table.locator("[data-row-kind=value]").count(), 1);
const search = table.getByRole("textbox", { name: "Rechercher une valeur" });
await search.fill("35");
assert.equal(await table.locator("[data-row-kind=value]").count(), 1);
assert.deepEqual(await table.locator(".rrc-hierarchy-name").allTextContents(), [
  "Accès & timers",
  "prach-ConfigIndex",
]);
await search.fill("prach-ConfigIndex");
assert.equal(await table.locator("[data-row-kind=value]").count(), 5);
await search.fill(original.blocks[0].param_key);
assert.equal(await table.locator("[data-row-kind=value]").count(), 1);
await search.fill("Accès");
assert.equal(await table.locator("[data-row-kind=value]").count(), 6);
await search.fill("");
assert.equal(await table.locator("[data-row-kind=value]").count(), 1);
await table.getByRole("button", { name: "Tout développer", exact: true }).click();
assert.equal(await table.locator("[data-row-kind=value]").count(), 6);
await table.getByRole("button", { name: /^Orange/ }).click();
const ids = await table
  .locator("[data-row-kind=value]")
  .evaluateAll((nodes) => nodes.map((n) => n.dataset.parameterId));
assert.equal(new Set(ids.slice(1)).size, 1);
report.G6 = report.G7 = "PASS";
await table.getByRole("button", { name: "Tout réduire", exact: true }).click();
assert.equal(await table.locator("[data-row-kind=value]").count(), 0);
await table.getByTestId("dict-csv-copy").click();
const csv = await page.evaluate(() => navigator.clipboard.readText());
assert.equal(csv.split("\r\n").length, 19);
assert.equal(
  csv.split("\r\n")[0],
  '"technology";"family_id";"family_name";"param_id";"asn1_path";"parameter_name";"value";"operator";"band";"occurrences";"denominator";"percentage";"total"',
);
for (const line of csv.split("\r\n").slice(1)) {
  assert.ok(line.startsWith('"LTE";'));
  assert.ok(line.includes("Accès & timers"));
  assert.ok(line.includes("rrcConnectionReconfiguration/"));
}
fs.writeFileSync(`${out}/values.csv`, csv);
report.G8 = "PASS";
await table.getByRole("button", { name: "Tout développer", exact: true }).click();
await table.getByLabel("Ordre des valeurs").selectOption("asc");
const totals = await table.locator("[data-row-kind=value]").evaluateAll((nodes) =>
  nodes.reduce((result, n) => {
    const id = n.dataset.parameterId;
    result[id] = (result[id] || 0) + Number(n.lastElementChild.textContent);
    return result;
  }, {}),
);
assert.deepEqual(Object.values(totals), [75, 75]);
report.G9 = "PASS";
const parameterToggle = table.getByRole("button", {
  name: "Réduire le paramètre prach-ConfigIndex",
  exact: true,
});
await parameterToggle.focus();
await page.keyboard.press("Enter");
assert.equal(await table.locator("[data-row-kind=value]").count(), 1);
await page.keyboard.press("Space");
assert.equal(await table.locator("[data-row-kind=value]").count(), 6);
report.keyboard = "PASS";
await table.scrollIntoViewIfNeeded();
await page
  .locator("[data-sonner-toast]")
  .waitFor({ state: "hidden", timeout: 10000 })
  .catch(() => {});
await table.locator("h3").click();
await page.mouse.move(0, 0);
await table.screenshot({ path: `${out}/table.png` });
await page.screenshot({ path: `${out}/desktop.png`, fullPage: true });
report.rowHeights = await table
  .locator("tbody tr")
  .evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().height));
await page.setViewportSize({ width: 400, height: 900 });
await table.scrollIntoViewIfNeeded();
report.mobile = await table.evaluate((n) => ({
  width: n.getBoundingClientRect().width,
  scroll: n.querySelector("[role=region]").scrollWidth,
  client: n.querySelector("[role=region]").clientWidth,
}));
assert.ok(report.mobile.width <= 400);
assert.ok(report.mobile.scroll > report.mobile.client);
await table.screenshot({ path: `${out}/mobile.png` });
await region.evaluate((n) => (n.scrollLeft = n.scrollWidth));
await table.screenshot({ path: `${out}/mobile-scrolled.png` });
await page.setViewportSize({ width: 1440, height: 900 });
await page.evaluate(() => document.documentElement.classList.add("dark"));
await table.screenshot({ path: `${out}/dark.png` });
await page.evaluate(() => document.documentElement.classList.remove("dark"));
// Existing filters must still drive both selected parameters after the table change.
await page.getByRole("button", { name: "Opérateur — Tous", exact: true }).click();
await page.getByRole("checkbox", { name: "Orange", exact: true }).check();
await page.keyboard.press("Escape");
await page.getByRole("button", { name: "Appliquer les filtres", exact: true }).click();
await page.waitForFunction(
  () => document.querySelector("[data-row-kind=value] td:last-child")?.textContent === "54",
);
assert.equal(await table.locator("thead th").count(), 3);
assert.equal(await table.locator("[data-row-kind=value]").count(), 4);
assert.equal(await page.locator('[data-testid^="dict-chart-"] canvas').count(), 2);
assert.match(await page.getByTestId("dict-selected-count").innerText(), /2/);
assert.equal(await table.getByRole("alert").count(), 0);
report.G10 = "PASS";

// Isolated browser-only stress fixture. No server/database writes; real-data screenshots above.
await page.route("**/dict/v2/distribution*", async (route) => {
  const source = original.blocks[0];
  const stress = {
    ...original,
    group_by: "operator_band",
    blocks: [
      {
        ...source,
        n_total: 2000,
        distinct_values: 2000,
        values: Array.from({ length: 2000 }, (_, n) => ({
          value: String(n),
          value_display: String(n),
          groups: [{ operator: "Orange", band: "B1", n: 1 }],
        })),
      },
    ],
  };
  await route.fulfill({ json: stress });
});
await page.reload({ waitUntil: "networkidle" });
await page.getByTestId("dict-tree-search").fill("highSpeedFlag");
await page.getByTestId("dict-leaf-highSpeedFlag").first().locator("input[type=checkbox]").check();
await table.locator("[data-row-kind=value]").first().waitFor();
assert.ok((await table.locator("tbody tr").count()) < 35);
await region.evaluate((n) => (n.scrollTop = n.scrollHeight));
await page.waitForFunction(() =>
  [...document.querySelectorAll(".rrc-hierarchy-value")].some((n) => n.textContent === "1999"),
);
assert.ok((await table.locator("tbody tr").count()) < 35);
await table.getByTestId("dict-csv-copy").click();
assert.equal(
  (await page.evaluate(() => navigator.clipboard.readText())).split("\r\n").length,
  2001,
);
await table.getByRole("button", { name: "Tout réduire", exact: true }).click();
assert.equal(await table.locator("[data-row-kind=value]").count(), 0);
await table.getByRole("button", { name: "Tout développer", exact: true }).click();
await page.waitForFunction(
  () => document.querySelector(".rrc-hierarchy-value")?.textContent === "0",
);
await region.evaluate((n) => (n.scrollTop = 10000));
await page.waitForTimeout(100);
await table.getByLabel("Ordre des valeurs").selectOption("desc");
assert.equal(await region.evaluate((n) => n.scrollTop), 10000);
report.syntheticWindowing =
  "PASS: 2000 values, last value reachable, <35 mounted rows, complete CSV, collapse/restore and sort scroll retention";

report.errors = errors;
assert.deepEqual(errors, []);
fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
fs.writeFileSync(`${out}/distribution.json`, JSON.stringify(original, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
