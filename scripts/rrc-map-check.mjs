import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import assert from "node:assert/strict";
const out = "rrc-map-evidence";
fs.mkdirSync(out, { recursive: true });
// Credentials remain in the API container; neither credentials nor session are logged/saved.
const session = JSON.parse(
  execFileSync(
    "docker",
    [
      "exec",
      "bc4-api-1",
      "python",
      "-c",
      `
import os,json,httpx
c=httpx.Client(base_url="http://localhost:8000")
r=c.post("/auth/login",json={"email":os.environ["BC4_ADMIN_EMAIL"],"password":os.environ["BC4_ADMIN_PASSWORD"]})
r.raise_for_status()
s=r.json()
s["user"]=c.get("/auth/me",headers={"Authorization":"Bearer "+s["token"]}).json()
print(json.dumps(s))
`,
    ],
    { encoding: "utf8" },
  ),
);
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1720, height: 1080 } });
const errors = [],
  requests = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (r) => {
  if (r.url().includes("/dict/v2/distribution")) requests.push(r.url());
});
await page.addInitScript(
  (s) => {
    localStorage.setItem("bc4.session", JSON.stringify(s));
    localStorage.setItem(
      "bc4.activeProject.v1." + s.user.email,
      JSON.stringify({ id: "134af70a06eb", name: "TEST2" }),
    );
  },
  { ...session, expires_at: session.expires_at ?? new Date(Date.now() + 3600000).toISOString() },
);

try {
  await page.goto("http://localhost:5174/rrc", { waitUntil: "networkidle" });
  const toggle = page.getByRole("switch", { name: "Carte / Infos", exact: true });
  await toggle.waitFor();
  assert.equal(await toggle.isChecked(), false);
  assert.equal(await page.locator("#rrc-map-info").count(), 0);
  const count = requests.length;
  await toggle.check();
  await page.locator("#rrc-map-info .maplibregl-canvas").waitFor();
  await page.getByTestId("dict-info-empty").waitFor();
  await page.getByTestId("dict-tree-search").fill("highSpeedFlag");
  await page
    .getByTestId("dict-leaf-highSpeedFlag")
    .first()
    .locator('input[type="checkbox"]')
    .check();
  await page.getByTestId("dict-info").waitFor({ timeout: 30000 });
  assert((await page.getByTestId("dict-info").innerText()).includes("highSpeedFlag"));
  await page.locator('[data-testid^="dict-chart-"] canvas').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: out + "/rrc-map-info.png", fullPage: true });
  const beforeHide = requests.length;
  await toggle.uncheck();
  assert.equal(await page.locator("#rrc-map-info").count(), 0);
  await toggle.check();
  await page.locator("#rrc-map-info .maplibregl-canvas").waitFor();
  assert.equal(requests.length, beforeHide);
  assert.deepEqual(errors, []);
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await toggle.isVisible());
  console.log(
    "PASS /rrc: toggle visible, hidden initially, map + real parameter info, hide/show without distribution refetch, mobile toggle visible; initial distribution requests: " +
      count,
  );
} finally {
  await browser.close();
}
