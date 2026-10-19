import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import assert from "node:assert/strict";
const session = JSON.parse(
  execFileSync(
    "docker",
    [
      "exec",
      "bc4-api-1",
      "python",
      "-c",
      `import os,json,httpx
c=httpx.Client(base_url='http://localhost:8000')
r=c.post('/auth/login',json={'email':os.environ['BC4_ADMIN_EMAIL'],'password':os.environ['BC4_ADMIN_PASSWORD']});r.raise_for_status();s=r.json();s['user']=c.get('/auth/me',headers={'Authorization':'Bearer '+s['token']}).json();print(json.dumps(s))`,
    ],
    { encoding: "utf8" },
  ),
);

const out = "kpi-v3-evidence";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ["--no-sandbox"] });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  page.setDefaultTimeout(60000);
  await page.addInitScript((s) => localStorage.setItem("bc4.session", JSON.stringify(s)), session);
  const errors = [],
    requests = [],
    responses = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (/\/api\/projects\/[^/]+\/kpi\//.test(r.url())) requests.push(r.url());
  });
  page.on("response", async (r) => {
    if (/\/api\/projects\/[^/]+\/kpi\//.test(r.url()) && r.ok()) {
      try {
        responses.push({ url: r.url(), body: await r.json() });
      } catch {}
    }
  });
  await page.goto("http://localhost:5174/projects");
  await page
    .locator("tr", { hasText: "Test_3" })
    .first()
    .getByRole("button", { name: "Ouvrir", exact: true })
    .click();
  await page.locator("nav a", { hasText: "KPI Analytics" }).click();
  const first = page.locator(".kpi-graph-card").first();
  await first.locator("canvas").waitFor();
  const name = await first.locator("h3").innerText(),
    code = await first.getAttribute("data-code");
  const search = page.getByRole("textbox", { name: "Rechercher un KPI", exact: true });
  await search.fill(name);
  const side = page.getByRole("button", { name: `Visualisation ${name}`, exact: true });
  await side.click();
  const graphRequestCount = requests.length;
  const tableBeforeGraph = await page.locator(".kpi-data-table").innerText();
  await page.getByRole("menuitem", { name: "Graphique", exact: true }).click();
  await first.getByRole("img", { name: /^Graphique en points agrégés/ }).waitFor();
  assert.equal(await first.getAttribute("data-visualization"), "graph");
  await page.waitForTimeout(350);
  assert.equal(requests.length, graphRequestCount);
  assert.equal(await page.locator(".kpi-data-table").innerText(), tableBeforeGraph);
  await page.screenshot({ path: out + "/graph.png" });
  await page.getByRole("button", { name: `Actions ${name}`, exact: true }).click();
  const graphPng = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Exporter PNG", exact: true }).click();
  assert(fs.statSync(await (await graphPng).path()).size > 1000);
  await side.click();
  await page.waitForTimeout(220);
  await page.screenshot({ path: out + "/sidebar.png" });
  const before = requests.length;
  await page.getByRole("menuitem", { name: "Tableau", exact: true }).click();
  assert.equal(await first.getAttribute("data-visualization"), "table");
  assert.equal(await page.locator(".kpi-graph-card").count(), 1);
  assert(
    await page.getByRole("checkbox", { name: `Sélectionner ${name}`, exact: true }).isChecked(),
  );
  assert((await page.locator(".kpi-data-table").innerText()).includes(name));
  const csv1 = page.waitForEvent("download");
  await page
    .locator(".kpi-data-table")
    .getByRole("button", { name: "Exporter CSV", exact: true })
    .click();
  const baseline = fs.readFileSync(await (await csv1).path(), "utf8");
  const actions = page.getByRole("button", { name: `Actions ${name}`, exact: true });
  await actions.click();
  await page.getByRole("menuitem", { name: "Carte", exact: true }).click();
  await first.getByText("Carte indisponible", { exact: true }).waitFor();
  assert.equal(requests.length, before);
  await actions.click();
  await page.getByRole("menuitem", { name: "Histogramme", exact: true }).click();
  await first.locator("canvas").waitFor();
  const csv2 = page.waitForEvent("download");
  await page
    .locator(".kpi-data-table")
    .getByRole("button", { name: "Exporter CSV", exact: true })
    .click();
  assert.equal(fs.readFileSync(await (await csv2).path(), "utf8"), baseline);
  await page.getByRole("button", { name: /^Opérateur —/ }).click();
  await page.getByRole("checkbox", { name: "Bouygues", exact: true }).uncheck();
  await page.keyboard.press("Escape");
  await page.getByText("Modifications non appliquées", { exact: true }).waitFor();
  assert.equal(requests.length, before);
  await actions.click();
  await page.getByRole("menuitem", { name: "Configurer X / Y", exact: true }).click();
  const form = page.getByRole("form", { name: `Axes ${name}`, exact: true });
  await form.waitFor();
  assert(await form.getByLabel("Axe Y", { exact: true }).isDisabled());
  assert(!(await form.getByLabel("Axe X", { exact: true }).innerText()).includes("Task Time"));
  await form.getByLabel("Axe X", { exact: true }).selectOption("operator");
  assert.equal(requests.length, before);
  await page.waitForTimeout(220);
  await page.screenshot({ path: out + "/axes.png" });
  await form.getByRole("button", { name: "Annuler", exact: true }).click();
  await actions.click();
  await page.getByRole("menuitem", { name: "Configurer X / Y", exact: true }).click();
  assert.equal(await form.getByLabel("Axe X", { exact: true }).inputValue(), "operator_band");
  await form.getByLabel("Axe X", { exact: true }).selectOption("operator");
  await form.getByRole("button", { name: "Appliquer", exact: true }).click();
  await page.waitForResponse(
    (r) =>
      r.url().includes(`/kpi/${code}?group_by=operator`) &&
      !r.url().includes("operator_band") &&
      r.ok(),
  );
  await first.locator("canvas").waitFor();
  assert.equal(requests.slice(before).filter((u) => u.includes(`/kpi/${code}?`)).length, 1);
  assert(requests.slice(before).every((u) => !new URL(u).searchParams.has("operator")));
  await actions.click();
  const png = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Exporter PNG", exact: true }).click();
  const pngFile = await (await png).path();
  assert(fs.statSync(pngFile).size > 1000);
  await page.waitForTimeout(220);
  await page.screenshot({ path: out + "/desktop.png" });
  const appliedResponse = page.waitForResponse(
    (r) =>
      r.url().includes(`/kpi/${code}?`) && new URL(r.url()).searchParams.has("operator") && r.ok(),
  );
  await page.getByRole("button", { name: "Appliquer les filtres", exact: true }).click();
  const filtered = await (await appliedResponse).json();
  assert(!(filtered.groups ?? []).some((g) => g.operator === "Bouygues"));
  await page.getByRole("button", { name: "Réinitialiser", exact: true }).click();
  await page.getByRole("button", { name: "Appliquer les filtres", exact: true }).click();
  // Sidebar selecting a second KPI must retain the first and must not duplicate it.
  const catalog = responses.find((r) => r.url.endsWith("/kpi/catalog")).body;
  const items = catalog.tree.flatMap((t) => t.families.flatMap((f) => f.kpis));
  const second = items.find(
    (k) => k.code !== code && k.status === "AVAILABLE" && k.nature === "Compteur",
  );
  assert(second);
  await search.fill(second.name);
  await page.getByRole("button", { name: `Visualisation ${second.name}`, exact: true }).click();
  await page.getByRole("menuitem", { name: "Tableau", exact: true }).click();
  const secondCard = page.locator(`.kpi-graph-card[data-code="${second.code}"]`);
  await secondCard.waitFor();
  await page.waitForLoadState("networkidle");
  assert.equal(await page.locator(".kpi-graph-card").count(), 2);
  await page.getByRole("button", { name: `Actions ${second.name}`, exact: true }).click();
  await page.getByRole("menuitem", { name: "Configurer X / Y", exact: true }).click();
  const form2 = page.getByRole("form", { name: `Axes ${second.name}`, exact: true });
  assert.equal(await form2.getByLabel("Axe X", { exact: true }).inputValue(), "operator_band");
  await form2.getByRole("button", { name: "Annuler", exact: true }).click();
  // Reselect restores mode/config for the same stable code.
  const cb = page.getByRole("checkbox", { name: `Sélectionner ${second.name}`, exact: true });
  await cb.uncheck();
  await cb.check();
  assert.equal(await secondCard.getAttribute("data-visualization"), "table");
  for (const width of [1920, 1280, 400]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole("button", { name: `Actions ${second.name}`, exact: true }).click();
    await page.getByRole("menuitem", { name: "Configurer X / Y", exact: true }).click();
    const box = await form2.boundingBox();
    assert(box.x >= 0 && box.x + box.width <= width);
    await page.waitForTimeout(220);
    await page.screenshot({ path: out + `/${width}.png` });
    await page.keyboard.press("Escape");
    assert(await form2.isHidden());
    await page.waitForFunction(
      (label) => document.activeElement?.getAttribute("aria-label") === label,
      `Actions ${second.name}`,
      { timeout: 3000 },
    );
    assert(
      await page
        .getByRole("button", { name: `Actions ${second.name}`, exact: true })
        .evaluate((el) => el === document.activeElement),
    );
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.waitForTimeout(220);
  await page.screenshot({ path: out + "/dark.png" });
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    out + "/report.json",
    JSON.stringify(
      {
        at: new Date().toISOString(),
        project: "4b7bfd50ddb6",
        requests,
        responses,
        errors,
        baselineCsv: baseline,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: sidebar/card menus; table/map empty; XY guard; independent axes; Cancel/Apply; one local request; PNG/CSV; reselect; responsive and dark screenshots.",
  );
} finally {
  await browser.close();
}
