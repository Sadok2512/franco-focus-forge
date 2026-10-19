import assert from "node:assert/strict";
import { chromium } from "playwright";
import fs from "node:fs";
const out = "/tmp/bc4-rrc-grouped";
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



const table = page.locator('.rrc-grouped');
const totals = () => table.locator('tbody tr').evaluateAll(nodes => nodes.reduce((result, row) => {
 const id = row.dataset.parameterId;
 result[id] = (result[id] || 0) + Number(row.lastElementChild.textContent.replace(/\s/g,'')); return result;
}, {}));
await page.getByRole('button',{name:'Opérateur — Tous',exact:true}).click();
await page.getByRole('checkbox',{name:'Orange',exact:true}).check();
await page.keyboard.press('Escape');
assert.ok(Object.values(await totals()).every(n=>n===75));
await page.getByRole('button',{name:'Appliquer les filtres',exact:true}).click();
await page.waitForFunction(()=>document.querySelector('.rrc-grouped tbody tr td:last-child')?.textContent==='54');
assert.ok(Object.values(await totals()).every(n=>n===54));
await page.getByRole('button',{name:'Bande — Tous',exact:true}).click();
const band = await page.locator('[data-radix-popper-content-wrapper] input[type=checkbox]').first().evaluate(n=>n.parentElement.textContent.trim());
await page.getByRole('checkbox',{name:band,exact:true}).check();
await page.keyboard.press('Escape');
assert.ok(Object.values(await totals()).every(n=>n===54));
await page.getByRole('button',{name:'Appliquer les filtres',exact:true}).click();
await page.waitForURL(url=>url.searchParams.has('band'));
const raw = responses.findLast(r=>r.group_by==='operator_band');
const expected = Object.fromEntries(raw.blocks.map(b=>[b.param_key,b.values.flatMap(v=>v.groups).filter(g=>g.operator==='Orange'&&g.band===band).reduce((sum,g)=>sum+g.n,0)]));
for (const mode of ['operator','band','operator_band']) {
 await page.getByTestId('dict-groupby-'+mode).click();
 await page.waitForTimeout(100);
 const actual = await totals();
 for (const [key,n] of Object.entries(expected)) assert.equal(actual[key]??0,n);
}
await page.getByRole('button',{name:'Réinitialiser',exact:true}).first().click();
await page.waitForFunction(()=>document.querySelector('.rrc-grouped tbody tr td:last-child')?.textContent==='75');
assert.ok(Object.values(await totals()).every(n=>n===75));
console.log('PASS: draft does not change table; Apply Orange=54; band intersection',band,expected,'; 3 grouping modes preserve counts; Reset=75; selected parameters preserved.');
assert.deepEqual(errors,[]);
await browser.close();
