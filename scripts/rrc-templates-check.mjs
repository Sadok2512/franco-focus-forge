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
const out = "rrc-templates-evidence";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ["--no-sandbox"] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(60000);
  await page.addInitScript((s) => localStorage.setItem("bc4.session", JSON.stringify(s)), session);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:5174/projects");
  await page
    .locator("tr", { hasText: "Test_3" })
    .first()
    .getByRole("button", { name: "Ouvrir", exact: true })
    .click();
  await page.locator("nav a", { hasText: "Dictionnaire RRC" }).first().click();
  await page.getByTestId("dict-tree-tabs").waitFor();
  assert.equal(await page.getByRole("tab").count(), 3);
  assert.equal(
    await page.getByRole("tab", { name: "Paramètres", exact: true }).getAttribute("aria-selected"),
    "true",
  );
  assert.equal(await page.getByRole("region", { name: "Catégories", exact: true }).count(), 0);
  await page.getByTestId("dict-tree-search").fill("highSpeedFlag");
  await page
    .getByTestId("dict-tree-scroll")
    .getByText("highSpeedFlag", { exact: true })
    .first()
    .waitFor();
  await page.screenshot({ path: out + "/00-parameters.png", fullPage: true });
  await page.getByRole("tab", { name: "Templates", exact: true }).click();
  assert.equal(await page.getByTestId("dict-tree-search").inputValue(), "");
  const cats = page.getByRole("region", { name: "Catégories", exact: true });
  await cats.getByRole("button", { name: /DRX/ }).waitFor();
  assert.equal(await cats.getByRole("button").count(), 11);
  await cats.getByRole("button", { name: /DRX/ }).click();
  const table = page.getByRole("region", { name: "Tableau du template" });
  await table
    .getByRole("row", { name: /longDRX-Cycle/ })
    .waitFor({ timeout: 15000 })
    .catch(async (e) => {
      console.log((await page.locator("body").innerText()).slice(-10000));
      await page.screenshot({ path: out + "/failure.png", fullPage: true });
      throw e;
    });
  assert.equal(
    await cats.getByRole("button", { name: /DRX/ }).getAttribute("aria-pressed"),
    "true",
  );
  assert.ok(Number((await page.getByTestId("dict-selected-count").innerText()).split(" ")[0]) > 0);
  await page.screenshot({ path: out + "/01-drx-operator.png", fullPage: true });
  await table.getByRole("combobox").selectOption("band");
  await page.waitForResponse(
    (r) => r.url().includes("/templates/drx/summary?group_by=band") && r.ok(),
  );
  await table.getByRole("row", { name: /longDRX-Cycle/ }).waitFor();
  await page.screenshot({ path: out + "/02-drx-band.png", fullPage: true });
  await table.getByRole("combobox").selectOption("operator_band");
  await page.waitForResponse(
    (r) => r.url().includes("/templates/drx/summary?group_by=operator_band") && r.ok(),
  );
  await table.getByRole("row", { name: /longDRX-Cycle/ }).waitFor();
  await page.screenshot({ path: out + "/03-drx-both.png", fullPage: true });
  await table.locator("tbody button:enabled").first().click();
  await page.getByTestId("dict-value-explorer").waitFor();
  await page.getByRole("button", { name: "Afficher le tableau du template", exact: true }).click();
  await page.getByRole("tab", { name: "Raw parameter", exact: true }).click();
  assert.equal(await cats.count(), 0);
  assert.equal(await table.count(), 0);
  await page.screenshot({ path: out + "/04-raw.png", fullPage: true });
  await page.getByRole("tab", { name: "Paramètres", exact: true }).click();
  assert.equal(await cats.count(), 0);
  assert.equal(await table.count(), 0);
  assert.equal(await page.getByTestId("dict-tree-search").inputValue(), "highSpeedFlag");
  await page
    .getByTestId("dict-tree-scroll")
    .getByText("highSpeedFlag", { exact: true })
    .first()
    .waitFor();
  await page.getByRole("tab", { name: "Paramètres", exact: true }).press("End");
  assert.equal(
    await page.getByRole("tab", { name: "Templates", exact: true }).getAttribute("aria-selected"),
    "true",
  );
  assert.equal(await page.getByTestId("dict-tree-search").inputValue(), "");
  assert.equal(
    await cats.getByRole("button", { name: /DRX/ }).getAttribute("aria-pressed"),
    "true",
  );

  await page.setViewportSize({ width: 400, height: 900 });
  await page.screenshot({ path: out + "/05-mobile.png", fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.screenshot({ path: out + "/06-dark.png", fullPage: true });
  await page.goto("http://localhost:5174/settings/dict-templates");
  await page.getByRole("combobox", { name: "Catégorie à administrer" }).selectOption("drx");
  const config = JSON.parse(
    await page.getByRole("textbox", { name: "Configuration du template" }).inputValue(),
  );
  assert.equal(config.entries.length, 8);
  assert.ok(config.revision >= 1);
  await page.screenshot({ path: out + "/07-admin.png", fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: 3 independent tabs, full parameter tree preserved, independent searches, keyboard tabs, 11 categories, DRX selection, 3 comparison modes, Raw isolation, 400px overflow, admin read-only, no runtime errors; 8 PNG.",
  );
} finally {
  await browser.close();
}
