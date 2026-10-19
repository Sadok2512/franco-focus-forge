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
await table.locator('tbody tr').nth(5).waitFor();
assert.equal(await table.locator('tbody tr').count(), 6);
assert.equal(await table.locator('.rrc-family > span:not(.sr-only)').count(), 1);
assert.equal(await table.locator('.rrc-parameter > span:not(.sr-only)').count(), 2);
assert.equal(await table.locator('.rrc-parameter > span:not(.sr-only)').last().innerText(), 'prach-ConfigIndex');
const raw = responses.at(-1);
assert.equal(raw.blocks.length, 2);
assert.deepEqual(raw.blocks.map(b => b.n_total), [75,75]);
assert.equal(await table.getByTitle('prach-ConfigIndex · Orange : 39 / 54 · 72,2 %').count(), 1);
assert.equal(await table.getByTitle('prach-ConfigIndex · Free : 4 / 9 · 44,4 %').count(), 1);
report.G1 = report.G2 = report.G3 = 'PASS';
const search = page.getByRole('textbox', { name: 'Rechercher une valeur', exact: true });
await search.fill('Accès & timers'); assert.equal(await table.locator('tbody tr').count(),6);
await search.fill('prach'); assert.equal(await table.locator('tbody tr').count(),5);
await search.fill('35'); assert.equal(await table.locator('tbody tr').count(),1);
assert.equal(await table.locator('.rrc-parameter > span:not(.sr-only)').innerText(),'prach-ConfigIndex');
assert.equal(await table.locator('.rrc-number').first().innerText(),'12 · 100,0 %');
await search.fill(''); report.G5 = 'PASS';
await table.getByRole('button',{name:/Total/}).click();
await table.getByRole('button',{name:/Total/}).click();
const ids = await table.locator('tbody tr').evaluateAll(nodes=>nodes.map(n=>n.dataset.parameterId));
assert.equal(new Set(ids.slice(1)).size,1); report.G6='PASS';
await table.getByTestId('dict-csv-copy').click();
const csv = await page.evaluate(()=>navigator.clipboard.readText());
assert.equal(csv.split('\r\n').length,19);
assert.ok(csv.startsWith('"family";"parameter_id";"parameter_name";"value";"operator";"occurrences";"denominator";"percentage";"total"'));
assert.ok(csv.split('\r\n').slice(1).every(line=>line.includes('Accès & timers')));
fs.writeFileSync(`${out}/values.csv`,csv); report.G7='PASS';
assert.equal(await page.locator('[data-testid^="dict-chart-"] canvas').count(),2);
assert.match(await page.getByTestId('dict-selected-count').innerText(),/2/);
const baseline = JSON.parse(fs.readFileSync(new URL('../rrc-grouped-evidence/distribution-before.json', import.meta.url),'utf8'));
for (const block of raw.blocks) {
  const original = baseline.blocks.find(b=>b.param_key===block.param_key);
  for (const key of ['values','n_total','distinct_values','verdict','comparability','result_id']) assert.deepEqual(block[key],original[key]);
}
report.G8='PASS';
await table.getByRole('button',{name:'Colonnes',exact:true}).click();
await page.getByLabel('Orange',{exact:true}).uncheck();
assert.equal(await table.locator('thead th').count(),6);
await page.keyboard.press('Escape');
await page.waitForFunction(()=>document.activeElement?.textContent==='Colonnes');
await table.getByRole('button',{name:'Colonnes',exact:true}).click();
await page.getByLabel('Orange',{exact:true}).check();
await page.keyboard.press('Escape');
report.columnVisibility='PASS'; report.tableKeyboardFocus='PASS';
await table.getByRole('button',{name:/Valeur/}).click();
await table.scrollIntoViewIfNeeded();
const toastClose = page.locator('[data-sonner-toast] [data-close-button]');
if (await toastClose.count()) await toastClose.first().click();
await page.locator('[data-sonner-toast]').waitFor({state:'hidden',timeout:10000}).catch(()=>{});
await page.mouse.move(0,0);
await page.screenshot({path:`${out}/desktop.png`,fullPage:true});
await table.screenshot({path:`${out}/table.png`});
await page.setViewportSize({width:400,height:900});
await table.scrollIntoViewIfNeeded();
report.mobile=await table.evaluate(n=>({width:n.getBoundingClientRect().width,scroll:n.querySelector('[role="region"]').scrollWidth,viewport:n.querySelector('[role="region"]').clientWidth}));
assert.ok(report.mobile.width<=400); assert.ok(report.mobile.scroll>report.mobile.viewport);
await page.screenshot({path:`${out}/mobile.png`,fullPage:true});
await page.setViewportSize({width:1440,height:900});
await page.evaluate(()=>document.documentElement.classList.add('dark'));
await page.screenshot({path:`${out}/dark.png`,fullPage:true});
report.errors=errors; assert.deepEqual(errors,[]);
fs.writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));
fs.writeFileSync(`${out}/distribution.json`,JSON.stringify(raw,null,2));
console.log(JSON.stringify(report,null,2));
await browser.close();
