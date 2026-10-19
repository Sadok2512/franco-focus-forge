import { chromium } from "playwright";
import fs from "node:fs";
const out = "/tmp/bc4-rrc-premium";
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
await page.getByRole("button", { name: "Zone géographique — Toutes", exact: true }).click();
report.geo = await page
  .getByRole("switch")
  .evaluateAll((nodes) =>
    nodes.map((n) => ({ name: n.getAttribute("aria-label"), disabled: n.disabled })),
  );
await page.keyboard.press("Escape");
report.geoFocus = await page
  .getByRole("button", { name: "Zone géographique — Toutes", exact: true })
  .evaluate((n) => n === document.activeElement);
for (const name of ["highSpeedFlag", "prach-ConfigIndex"]) {
  await page.getByTestId("dict-tree-search").fill(name);
  await page.getByTestId(`dict-leaf-${name}`).first().locator('input[type="checkbox"]').check();
}
await page.getByTestId("dict-tree-search").fill("");
await page.locator('[data-testid^="dict-chart-"] canvas').nth(1).waitFor({ timeout: 30000 });
report.charts = await page.locator('[data-testid^="dict-chart-"]').count();
report.selected = await page.getByTestId("dict-selected-count").innerText();
const treeScroll = page.getByTestId("dict-tree-tabs").locator("..").locator(":scope > div").last();
await treeScroll.evaluate((node) => (node.scrollTop = 100));
report.treeScrollBefore = await treeScroll.evaluate((node) => node.scrollTop);
await page.getByRole("button", { name: "Réduire les paramètres" }).click();
await page.getByRole("button", { name: "Afficher les paramètres" }).click();
report.selectedRestored = await page.getByTestId("dict-selected-count").innerText();
report.treeScrollAfter = await treeScroll.evaluate((node) => node.scrollTop);
await page
  .getByRole("textbox", { name: "Rechercher une valeur", exact: true })
  .fill("highSpeedFlag");
report.searchRows = await page.locator("tbody tr").allTextContents();
await page.getByRole("textbox", { name: "Rechercher une valeur", exact: true }).fill("");
await page.getByRole("button", { name: /Total/ }).last().click();
report.sort = await page.locator('th[aria-sort="ascending"]').innerText();
await page.getByTestId("dict-csv-copy").click();
report.csv = await page.evaluate(() => navigator.clipboard.readText());
await page.screenshot({ path: `${out}/desktop.png`, fullPage: true });
await page.getByRole("button", { name: "Colonnes", exact: true }).click();
report.columnOptions = await page.getByRole("dialog").locator('input[type="checkbox"]').count();
await page.getByRole("dialog").getByRole("checkbox").first().uncheck();
report.visibleColumnsAfterHide = await page.locator("thead th").count();
await page.getByRole("dialog").getByRole("checkbox").first().check();
await page.keyboard.press("Escape");
const separator = page.getByRole("separator").first();
const handle = await separator.boundingBox();
const treePanel = page.locator("[data-panel]").first();
report.sidebarBefore = (await treePanel.boundingBox()).width;
await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
await page.mouse.down();
await page.mouse.move(handle.x + 60, handle.y + handle.height / 2, { steps: 10 });
await page.mouse.up();
report.sidebarAfter = (await treePanel.boundingBox()).width;
await page.getByRole("button", { name: "Opérateur — Tous", exact: true }).click();
await page.getByRole("textbox", { name: "Rechercher Opérateur", exact: true }).fill("Orange");
await page.getByRole("checkbox", { name: "Orange", exact: true }).check();
await page.keyboard.press("Escape");
await Promise.all([
  page.waitForResponse(
    (response) => response.url().includes("group_by=operator_band") && response.ok(),
  ),
  page.getByRole("button", { name: "Appliquer les filtres", exact: true }).click(),
]);
await page.getByText("Comparaison : N/D pour la sélection filtrée").first().waitFor();
report.filteredRows = await page.locator("tbody tr").allTextContents();
report.filteredChartText = await page.locator('[data-testid^="dict-chart-"]').allTextContents();
report.apiOrangeTotals = responses.at(-1)?.blocks.map((block) => ({
  name: block.display_name,
  n: block.values.reduce(
    (sum, value) =>
      sum +
      value.groups
        .filter((group) => group.operator === "Orange")
        .reduce((sum, group) => sum + group.n, 0),
    0,
  ),
}));
report.url = page.url();
await page.getByRole("button", { name: "Bande — Tous", exact: true }).click();
report.bands = await page
  .getByRole("dialog")
  .getByRole("checkbox")
  .evaluateAll((nodes) => nodes.map((node) => node.parentElement.textContent));
const bandCheckbox = page.getByRole("dialog").getByRole("checkbox").first();
if (await bandCheckbox.count()) {
  await bandCheckbox.check();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Appliquer les filtres", exact: true }).click();
  report.bandFilterUrl = page.url();
} else await page.keyboard.press("Escape");
await page.getByRole("button", { name: "Réinitialiser", exact: true }).first().click();
await page.getByRole("radio", { name: "NR", exact: true }).click();
await page.getByRole("button", { name: "Appliquer les filtres", exact: true }).click();
report.techUrl = page.url();
report.selectionAfterTech = await page.getByTestId("dict-selected-count").innerText();
await page.getByRole("button", { name: "Réinitialiser", exact: true }).first().click();
await page.locator('[data-testid^="dict-chart-"] canvas').nth(1).waitFor();
await page.setViewportSize({ width: 400, height: 900 });
await page.screenshot({ path: `${out}/mobile.png`, fullPage: true });
report.mobile = await page.evaluate(() => ({
  width: innerWidth,
  scroll: document.documentElement.scrollWidth,
  table: document.querySelector("table")?.getBoundingClientRect().width,
  dictionary: document.querySelector(".rrc-premium")?.getBoundingClientRect().width,
}));
await page.getByRole("button", { name: "Thème sombre", exact: true }).click();
await page.waitForFunction(
  () =>
    document.documentElement.classList.contains("dark") &&
    !document.documentElement.classList.contains("light"),
);
await page.waitForTimeout(1000);
report.dark = await page.evaluate(() => ({
  classes: document.documentElement.className,
  card: getComputedStyle(document.querySelector(".rrc-results")).backgroundColor,
  text: getComputedStyle(document.querySelector(".rrc-results")).color,
  charts: document.querySelectorAll("canvas").length,
}));
await page.screenshot({ path: `${out}/dark.png`, fullPage: true, animations: "disabled" });
report.errors = errors;
fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
