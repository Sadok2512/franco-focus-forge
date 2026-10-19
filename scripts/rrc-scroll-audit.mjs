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
await page.goto("http://localhost:5174/projects", { waitUntil: "networkidle" });
await page
  .locator("tr", { hasText: "Test_3" })
  .first()
  .getByRole("button", { name: "Ouvrir", exact: true })
  .click();
await page.locator("nav a", { hasText: "Dictionnaire RRC" }).first().click();
await page.getByTestId("dict-tree-search").waitFor();

const report = [];
let n = 1000;
await page.route("**/dict/v2/distribution*", async (route) => {
  const data = await (await route.fetch()).json();
  data.blocks = data.blocks.map((b) => ({
    ...b,
    n_total: n,
    distinct_values: n,
    values: Array.from({ length: n }, (_, i) => ({
      value: String(i),
      value_display: String(i),
      groups: [{ operator: "Orange", band: "B1", n: 1 }],
    })),
  }));
  await route.fulfill({ json: data });
});
for (const [width, height, count] of [
  [1440, 900, 1000],
  [1440, 900, 1],
  [400, 900, 1],
]) {
  n = count;
  await page.setViewportSize({ width, height });
  await page.reload({ waitUntil: "networkidle" });
  await page.getByTestId("dict-tree-search").fill("a3-Offset");
  await page.getByTestId("dict-leaf-a3-Offset").first().locator("input[type=checkbox]").check();
  await page.locator(".rrc-table-viewport").waitFor();
  await page.locator(".rrc-table-viewport").evaluate((e) => (e.scrollTop = e.scrollHeight));
  await page.waitForTimeout(100);
  report.push(
    await page.evaluate(() => {
      const t = document.querySelector(".rrc-table-viewport"),
        last = t.querySelector("tbody tr:last-child"),
        root = document.querySelector(".rrc-premium");
      return {
        width: innerWidth,
        count: t.querySelector("table").getAttribute("aria-rowcount"),
        table: {
          h: t.clientHeight,
          scroll: t.scrollHeight,
          top: t.scrollTop,
          lastBottom: last.getBoundingClientRect().bottom,
          viewportBottom: t.getBoundingClientRect().bottom,
        },
        root: { h: root.clientHeight, scroll: root.scrollHeight },
        body: document.documentElement.scrollHeight,
        ancestor: [
          ...(function* (n) {
            while (n) {
              yield n;
              n = n.parentElement;
            }
          })(t),
        ].map((n) => ({
          cls: n.className,
          h: n.clientHeight,
          scroll: n.scrollHeight,
          min: getComputedStyle(n).minHeight,
          overflow: getComputedStyle(n).overflow,
        })),
      };
    }),
  );
}
console.log(JSON.stringify(report, null, 2));
fs.writeFileSync("/tmp/rrc-scroll-before.json", JSON.stringify(report, null, 2));
await browser.close();
