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

for (const name of ["a2-Threshold", "a3-Offset"]) {
  await page.getByTestId("dict-tree-search").fill(name);
  await page
    .getByTestId("dict-leaf-" + name)
    .first()
    .locator("input[type=checkbox]")
    .check();
}
await page.waitForFunction(() => document.querySelectorAll("[data-row-kind=value]").length === 8);
await page.getByTestId("dict-tree-search").fill("");
await page.getByTestId("dict-csv-copy").click();
const csv = await page.evaluate(() => navigator.clipboard.readText());
assert.equal(csv.split("\r\n").length, 33);
assert.equal(csv.split("\r\n")[0].split(";").length, 13);
assert.ok(csv.includes("reportConfigToAddModList/reportConfig/triggerType/eventId/a2-Threshold"));
fs.writeFileSync("/tmp/rrc-sync-values.csv", csv);
await page.getByRole("radio", { name: "LTE", exact: true }).click();
await page.getByRole("button", { name: "Appliquer les filtres", exact: true }).click();
await page.waitForFunction(
  () =>
    document.querySelectorAll("[data-row-kind=value]").length === 8 &&
    !document.querySelector(".rrc-analysis-scroll").textContent.includes("actualisation en cours"),
);
assert.ok((await page.getByTestId("dict-chart-a2-Threshold").innerText()).includes("n=3098"));
await page.getByRole("radio", { name: "NR", exact: true }).click();
await page.getByRole("button", { name: "Appliquer les filtres", exact: true }).click();
await page.getByText("Aucune valeur pour les filtres appliqués.", { exact: false }).waitFor();
assert.match(await page.getByTestId("dict-selected-count").innerText(), /2/);
await page.getByRole("button", { name: "Réinitialiser", exact: true }).first().click();
assert.equal(await page.locator("[data-row-kind=value]").count(), 0);
await page.getByRole("button", { name: "Appliquer les filtres", exact: true }).click();
await page.waitForFunction(() => document.querySelectorAll("[data-row-kind=value]").length === 8);
await page.getByTestId("dict-csv-copy").click();
assert.equal(await page.evaluate(() => navigator.clipboard.readText()), csv);
await page.locator(".rrc-results").screenshot({ path: "/tmp/rrc-sync-table.png" });
assert.deepEqual(errors, []);
console.log(
  "PASS: CSV 13 columns / 32 data records, stable paths and unchanged export after LTE/NR/default transitions; 2 selected parameters retained.",
);
await browser.close();
