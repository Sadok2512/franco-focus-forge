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

const toggle = page.getByRole('button',{name:'Plier les filtres',exact:true});
await page.getByRole('radio',{name:'LTE',exact:true}).click();
await toggle.click();
assert.equal(await page.locator('#rrc-filter-section').isVisible(),false);
assert.equal(await page.getByRole('button',{name:'Déplier les filtres',exact:true}).getAttribute('aria-expanded'),'false');
await page.getByRole('button',{name:'Déplier les filtres',exact:true}).click();
assert.equal(await page.getByRole('radio',{name:'LTE',exact:true}).getAttribute('aria-checked'),'true');
assert.equal(await page.getByRole('button',{name:'Appliquer les filtres',exact:true}).isEnabled(),true);
assert.deepEqual(errors,[]);
await page.setViewportSize({width:400,height:900});
assert.ok((await page.locator('.rrc-toolbar').boundingBox()).width <=400);
console.log('PASS: collapse/restore, expanded state, pending technology selection, Apply state, 400px toolbar, no page errors');
await browser.close();
