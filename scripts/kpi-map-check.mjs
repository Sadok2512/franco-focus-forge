import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import assert from "node:assert/strict";
const out = "kpi-multigraph-evidence";
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
  if (/\/kpi\/[^/?]+\?/.test(r.url())) requests.push(r.url());
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
  await page.goto("http://localhost:5174/kpi", { waitUntil: "networkidle" });
  const toggle = page.getByRole("switch", { name: "Carte / Infos", exact: true });
  await toggle.waitFor();
  assert.equal(await toggle.isChecked(), false);
  assert.equal(await page.locator("#kpi-map-info").count(), 0);
  await page.locator('.kpi-graph-card[data-status="Available"]').first().waitFor();
  const initialRequests = requests.length;
  await toggle.check();
  await page.getByRole("region", { name: "Carte et informations" }).waitFor();
  await page.locator("#kpi-map-info .maplibregl-canvas").waitFor();
  assert((await page.locator("#kpi-map-info").innerText()).includes("LTE_RRC_ATTEMPTS"));
  assert((await page.locator("#kpi-map-info").innerText()).includes("aucun emplacement de mesure"));
  await page.waitForTimeout(800);
  assert.equal(requests.length, initialRequests);
  await page.screenshot({ path: out + "/map-info.png", fullPage: true });
  await toggle.uncheck();
  assert.equal(await page.locator("#kpi-map-info").count(), 0);
  await toggle.check();
  await page.locator("#kpi-map-info .maplibregl-canvas").waitFor();
  assert.equal(requests.length, initialRequests);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: initially hidden, activation, real KPI info, no extra analytic requests, hide/unmount, reactivation, no page errors.",
  );
} finally {
  await browser.close();
}
