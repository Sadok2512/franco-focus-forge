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
const out = "rrc-filterbar-evidence";
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: ["--no-sandbox"] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(60000);
  await page.addInitScript((s) => localStorage.setItem("bc4.session", JSON.stringify(s)), session);
  const requests = [];
  page.on("request", (r) => {
    if (r.url().includes("/dict/v2/distribution")) requests.push(r.url());
  });
  await page.goto("http://localhost:5174/projects");
  await page
    .locator("tr", { hasText: "Test_3" })
    .first()
    .getByRole("button", { name: "Ouvrir", exact: true })
    .click();
  await page.locator("nav a", { hasText: "Dictionnaire RRC" }).first().click();
  await page.getByTestId("dict-tree-search").fill("highSpeedFlag");
  await page.getByTestId("dict-leaf-highSpeedFlag").first().locator("input[type=checkbox]").check();
  await page.getByTestId("dict-chart-highSpeedFlag").waitFor();
  const filterbar = page.getByRole("region", { name: "Filtres du dictionnaire" });
  assert.equal(await page.getByText("Réduire les paramètres", { exact: true }).count(), 0);
  assert.equal(await filterbar.getByRole("button", { name: "Carte", exact: true }).count(), 1);
  assert.equal(await filterbar.getByRole("button", { name: "Infos", exact: true }).count(), 1);
  const selectedBefore = await page.getByTestId("dict-selected-count").innerText();
  await page
    .getByRole("region", { name: "Paramètres RRC", exact: true })
    .getByRole("button", { name: "Plier l’arbre des paramètres", exact: true })
    .click();
  await filterbar.getByRole("button", { name: "Afficher les paramètres", exact: true }).click();
  await page.getByRole("button", { name: "Plier l’arbre des paramètres", exact: true }).waitFor();
  assert.equal(await page.getByTestId("dict-selected-count").innerText(), selectedBefore);
  assert.equal(await page.getByTestId("dict-tree-search").inputValue(), "highSpeedFlag");
  const before = requests.length;
  await page.getByRole("button", { name: "Opérateur — Tous", exact: true }).click();
  await page.getByRole("checkbox", { name: "Orange", exact: true }).check();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Bande — Tous", exact: true }).click();
  await page.getByRole("checkbox", { name: "B1", exact: true }).check();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  assert.equal(requests.length, before);
  assert.match(await page.locator(".rrc-applied-chips").innerText(), /Toute la population/);
  await page.getByRole("button", { name: "Appliquer les filtres", exact: true }).click();
  await page.locator(".rrc-applied-chips").getByTitle("Orange", { exact: true }).waitFor();
  await page.screenshot({ path: out + "/applied.png", fullPage: true });
  await page
    .getByRole("region", { name: "Filtres du dictionnaire" })
    .getByRole("button", { name: "Réinitialiser", exact: true })
    .click();
  assert.equal(
    await page.locator(".rrc-applied-chips").getByTitle("Orange", { exact: true }).count(),
    1,
  );
  await page.getByRole("button", { name: "Appliquer les filtres", exact: true }).click();
  await page
    .locator(".rrc-applied-chips")
    .getByText("Toute la population du projet", { exact: true })
    .waitFor();
  for (const width of [1920, 1440, 1280, 400]) {
    await page.setViewportSize({ width, height: 900 });
    const height = (await page.locator(".rrc-toolbar").boundingBox()).height;
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (width >= 1280) assert(height <= 110, `${width}: ${height}`);
    assert.equal(
      await page.getByRole("button", { name: /Plier les filtres|Déplier les filtres/ }).count(),
      0,
    );
    await page.screenshot({ path: out + "/" + width + ".png", fullPage: true });
    console.log(JSON.stringify({ width, filterHeight: height }));
  }
  console.log(
    "PASS: draft has no analytical requests; applied chips only change after Apply; Reset remains draft; compact layout and no horizontal overflow at 4 widths.",
  );
} finally {
  await browser.close();
}
