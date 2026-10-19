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
for (const [width, height] of [
  [1920, 1080],
  [1440, 900],
  [1280, 800],
]) {
  await page.setViewportSize({ width, height });
  report.push(
    await page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
      body: {
        scroll: document.documentElement.scrollHeight,
        client: document.documentElement.clientHeight,
      },
      nodes: [
        ...document.querySelectorAll("main,.rrc-premium,.rrc-toolbar,[data-group],[data-panel]"),
      ].map((n) => {
        const c = getComputedStyle(n);
        return {
          tag: n.tagName,
          cls: n.className,
          h: n.getBoundingClientRect().height,
          height: c.height,
          min: c.minHeight,
          max: c.maxHeight,
          flex: c.flex,
          overflow: c.overflow,
          scroll: n.scrollHeight,
          client: n.clientHeight,
        };
      }),
    })),
  );
}
console.log(JSON.stringify(report, null, 2));
fs.writeFileSync("/tmp/rrc-layout-before.json", JSON.stringify(report, null, 2));
await browser.close();
