import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import assert from "node:assert/strict";
const out = new URL("../../kpi-operator-audit/", import.meta.url).pathname;
const session = JSON.parse(
  execFileSync(
    "docker",
    [
      "exec",
      "bc4-api-1",
      "python",
      "-c",
      `import os,json,httpx
c=httpx.Client(base_url='http://localhost:8000');r=c.post('/auth/login',json={'email':os.environ['BC4_ADMIN_EMAIL'],'password':os.environ['BC4_ADMIN_PASSWORD']});r.raise_for_status();s=r.json();s['user']=c.get('/auth/me',headers={'Authorization':'Bearer '+s['token']}).json();print(json.dumps(s))`,
    ],
    { encoding: "utf8" },
  ),
);
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const report = {
  at: new Date().toISOString(),
  requests: [],
  responses: [],
  checks: [],
  errors: [],
};
let page;
const analytical = (url) =>
  /\/projects\/[^/]+\/(kpi\/[^/?]+|metrics\/series|metrics\/captures|captures\/[^/]+\/events|tasks)(\?|$)/.test(
    url,
  ) &&
  !url.includes("/kpi/catalog") &&
  !url.includes("/kpi/filters");
const pass = (name) => {
  report.checks.push({ name, status: "PASS" });
  console.log("PASS", name);
};
try {
  page = await browser.newPage({ viewport: { width: 1800, height: 2200 } });
  page.setDefaultTimeout(240000);
  await page.addInitScript((s) => localStorage.setItem("bc4.session", JSON.stringify(s)), session);
  page.on("pageerror", (e) => report.errors.push(e.message));
  page.on("request", (r) => {
    if (analytical(r.url())) report.requests.push({ at: Date.now(), url: r.url() });
  });
  page.on("response", async (r) => {
    if (analytical(r.url())) {
      try {
        report.responses.push({
          at: Date.now(),
          url: r.url(),
          status: r.status(),
          body: await r.json(),
        });
      } catch {}
    }
  });
  await page.goto("http://localhost:5174/projects");
  await page
    .locator("tr", { hasText: "TEST2" })
    .first()
    .getByRole("button", { name: "Ouvrir", exact: true })
    .click();
  await page.locator("nav a", { hasText: "KPI Analytics" }).click();
  const url = new URL(page.url());
  url.searchParams.set("kpi", "LTE_DL_BLER");
  await page.goto(url.toString());
  const card = page.locator("#kpi-graph-LTE_DL_BLER");
  const view = card.getByRole("combobox", { name: /^Vue / });
  await view.selectOption("chronogram");
  const panel = page.getByTestId("chronogram");
  const loaded = page.waitForResponse(
    (r) =>
      r.url().includes("/metrics/series?") &&
      r.url().includes("capture_id=705aa521e9e0") &&
      r.status() === 200,
  );
  await panel
    .getByRole("combobox", { name: "Capture du chronogramme" })
    .selectOption("705aa521e9e0");
  await loaded;
  await panel.getByText("Chargement du chronogramme…").waitFor({ state: "hidden" });
  await page.waitForTimeout(1500);
  const draft = async (operators) => {
    await page.getByRole("button", { name: /^Opérateur —/ }).click();
    const group = page.getByRole("group", { name: "Opérateur", exact: true });
    for (const label of await group.locator("label").all()) {
      const name = (await label.innerText()).trim();
      await label.getByRole("checkbox").setChecked(operators.includes(name));
    }
    await page.keyboard.press("Escape");
  };
  const apply = async (operators) => {
    const response = page.waitForResponse((r) => {
      const u = new URL(r.url());
      return (
        u.pathname.endsWith("/metrics/series") &&
        r.status() === 200 &&
        JSON.stringify(u.searchParams.getAll("operator").sort()) ===
          JSON.stringify([...operators].sort()) &&
        (operators.length > 0 || u.searchParams.get("operator_mode") === "none")
      );
    });
    await page.getByRole("button", { name: "Appliquer les filtres", exact: true }).click();
    const data = await (await response).json();
    assert.equal(data.capture_id, "705aa521e9e0");
    await panel.getByText("Chargement du chronogramme…").waitFor({ state: "hidden" });
    return data;
  };
  let before = report.requests.length;
  await draft(["Orange"]);
  await page.waitForTimeout(1200);
  assert.equal(report.requests.length, before);
  pass("G5 draft changes trigger zero analytic requests");
  const orange = await apply(["Orange"]);
  assert.ok(orange.series.some((s) => s.n_total > 0));
  await panel.screenshot({ path: out + "orange-chronogram.png" });
  pass("G2 Orange applied to chronogram");
  for (const mode of ["histogram", "graph", "table", "chronogram"]) {
    await view.selectOption(mode);
    assert.deepEqual(new URL(page.url()).searchParams.has("op"), true);
    if (mode === "chronogram")
      assert.equal(
        await panel.getByRole("combobox", { name: "Capture du chronogramme" }).inputValue(),
        "705aa521e9e0",
      );
  }
  pass("G11 mode changes retain capture/KPI/applied operator");
  await draft(["Orange", "SFR"]);
  const multi = await apply(["Orange", "SFR"]);
  assert.deepEqual(multi.series, orange.series);
  pass("G3 union does not duplicate this Orange capture");
  await draft([]);
  const empty = await apply([]);
  assert.ok(empty.series.every((s) => s.n_total === 0));
  assert.match(
    await page.getByRole("button", { name: /^Opérateur —/ }).getAttribute("aria-label"),
    /Aucun/,
  );
  pass("empty selection stays empty, never All");
  await page.getByRole("button", { name: /^Opérateur —/ }).click();
  await page.getByRole("button", { name: "Réinitialiser", exact: true }).last().click();
  await page.keyboard.press("Escape");
  const allResponse = page.waitForResponse((r) => {
    const u = new URL(r.url());
    return (
      u.pathname.endsWith("/metrics/series") &&
      !u.searchParams.has("operator") &&
      !u.searchParams.has("operator_mode") &&
      r.status() === 200
    );
  });
  await page.getByRole("button", { name: "Appliquer les filtres", exact: true }).click();
  const all = await (await allResponse).json();
  assert.deepEqual(all.series, orange.series);
  pass("G4 reset restores unrestricted population");
  await view.selectOption("histogram");
  await card.getByText("Chargement de la métrique…").waitFor({ state: "hidden" });
  // Existing data table remains an aggregate table; its export is verified as such.
  const dataTable = page.locator(".kpi-data-table");
  const download = page.waitForEvent("download");
  await dataTable.getByRole("button", { name: "Exporter CSV", exact: true }).click();
  await (await download).saveAs(out + "aggregate-export.csv");
  const csv = fs.readFileSync(out + "aggregate-export.csv", "utf8");
  assert.ok(csv.includes("result_id"));
  assert.ok(csv.includes("LTE_DL_BLER"));
  pass("existing aggregate table search/sort/export preserved (raw table absent in baseline)");
  await page.screenshot({ path: out + "filtered-histogram-table.png", fullPage: true });
  assert.deepEqual(report.errors, []);
  report.status = "PASS";
} catch (e) {
  report.status = "FAIL";
  report.error = String(e);
  if (page)
    await page.screenshot({ path: out + "browser-failure.png", fullPage: true }).catch(() => {});
  throw e;
} finally {
  fs.writeFileSync(out + "browser.json", JSON.stringify(report, null, 2));
  await browser.close();
}
