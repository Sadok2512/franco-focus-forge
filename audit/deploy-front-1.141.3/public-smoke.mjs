import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const base = "http://185.248.33.125:5174";
const out = "audit/deploy-front-1.141.3";
const password = (await readFile("/home/devmat/BC4/.secrets/admin_pw", "utf8")).trim();
await mkdir(out, { recursive: true });
const login = await fetch(`${base}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@bc4.local", password }),
});
assert.equal(login.status, 200);
const session = await login.json();
const me = await fetch(`${base}/api/auth/me`, {
  headers: { Authorization: `Bearer ${session.token}` },
}).then((response) => response.json());

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(60_000);
const errors = [];
const encodings = new Set();
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text()}`);
});
page.on("response", (response) => {
  const encoding = response.headers()["content-encoding"];
  if (encoding) encodings.add(encoding);
  if (response.url().includes("/api/") && response.status() >= 400) {
    errors.push(`HTTP ${response.status()} ${response.url()}`);
  }
});
await page.addInitScript(
  ({ auth, user }) => {
    localStorage.setItem(
      "bc4.session",
      JSON.stringify({
        token: auth.token,
        token_type: "Bearer",
        expires_at: auth.expires_at,
        user,
      }),
    );
    localStorage.setItem(
      `bc4.activeProject.v1.${user.email}`,
      JSON.stringify({ id: "43e81a34a073", name: "Test_6" }),
    );
    sessionStorage.setItem("bc4.capture.v2.43e81a34a073", "a4b0c321c52e");
  },
  { auth: session, user: me },
);

const routes = ["/projects", "/kpi", "/map", "/rf", "/signaling"];
const results = [];
for (const route of routes) {
  const response = await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded" });
  assert.equal(response?.status(), 200, `${route} navigation failed`);
  await page.waitForTimeout(800);
  assert.notEqual(new URL(page.url()).pathname, "/login", `${route} redirected to login`);
  const body = (await page.locator("body").innerText()).trim();
  assert.ok(body.length > 20, `${route} rendered an empty page`);
  results.push({ requested: route, final: new URL(page.url()).pathname, status: response?.status() });
  await page.screenshot({ path: `${out}/public-${route.slice(1)}.png`, fullPage: true });
}
assert.deepEqual(errors, []);
const report = { base, results, encodings: [...encodings], errors };
await writeFile(`${out}/public-smoke.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
await browser.close();
