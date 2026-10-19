import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import assert from "node:assert/strict";
const out = "rrc-points-evidence";
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
page.on("pageerror", (e) => errors.push(e.stack || e.message));
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

const report = {};
try {
  await page.goto("http://localhost:5174/rrc", { waitUntil: "networkidle" });
  await page.getByTestId("dict-tree-search").fill("dl-Bandwidth");
  await page.getByTestId("dict-leaf-dl-Bandwidth").first().locator("input[type=checkbox]").check();
  const responsePromise = page.waitForResponse((r) => r.url().includes("/dict/v2/map?") && r.ok());
  await page.getByRole("button", { name: "Carte", exact: true }).click();
  const response = await responsePromise,
    data = await response.json();
  assert.equal(data.points.length, 4);
  assert.equal(data.geolocated_occurrences, 4);
  report.api = {
    total: data.total_occurrences,
    geolocated: data.geolocated_occurrences,
    operators: data.operators,
  };
  assert(
    data.points.every((p) => p.source && p.event_id && p.capture_id && Number.isInteger(p.seq)),
  );
  await page
    .getByRole("region", { name: "Carte des mesures RRC" })
    .getByText("Opérateurs", { exact: true })
    .waitFor();
  const canvas = page.locator(".maplibregl-canvas");
  await page.waitForTimeout(1600);
  const box = await canvas.boundingBox();
  const coordinates = data.points.map((p) => ({
    x: (p.lon + 180) / 360,
    y:
      (1 -
        Math.log(Math.tan((p.lat * Math.PI) / 180) + 1 / Math.cos((p.lat * Math.PI) / 180)) /
          Math.PI) /
      2,
  }));
  const minX = Math.min(...coordinates.map((p) => p.x)),
    maxX = Math.max(...coordinates.map((p) => p.x)),
    minY = Math.min(...coordinates.map((p) => p.y)),
    maxY = Math.max(...coordinates.map((p) => p.y));
  const scale = Math.min(
    (box.width - 120) / (maxX - minX),
    (box.height - 120) / (maxY - minY),
    512 * 2 ** 16,
  );
  const first = coordinates[0];
  await page.mouse.click(
    box.x + box.width / 2 + (first.x - (minX + maxX) / 2) * scale,
    box.y + box.height / 2 + (first.y - (minY + maxY) / 2) * scale,
  );
  await page.locator(".rrc-map-proof").waitFor();
  const popup = await page.locator(".rrc-map-proof").innerText();
  assert(
    popup.includes("Valeur brute") &&
      popup.includes("param_occurrence:") &&
      popup.includes("Capture"),
  );
  report.popup = "PASS";
  await page.waitForTimeout(1200);
  await page.screenshot({ path: out + "/points-and-values.png" });
  await page.locator(".maplibregl-popup-close-button").click();
  await page.getByRole("combobox", { name: "Coloration de la carte" }).selectOption("value");
  await page.getByRole("combobox", { name: "Paramètre de coloration" }).waitFor();
  assert((await page.getByLabel("Légende des mesures").innerText()).includes("n75"));
  report.valueColor = "PASS";
  await page.getByRole("combobox", { name: "Coloration de la carte" }).selectOption("operator");
  const reqs = [];
  page.on("request", (r) => {
    if (r.url().includes("/dict/v2/map?")) reqs.push(r.url());
  });
  const count = reqs.length;
  await page.getByRole("button", { name: /^Opérateur —/ }).click();
  await page.getByRole("checkbox", { name: "Orange", exact: true }).check();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  assert.equal(reqs.length, count);
  const filteredResponse = page.waitForResponse((r) => r.url().includes("/dict/v2/map?") && r.ok());
  await page.getByRole("button", { name: "Appliquer les filtres", exact: true }).click();
  const filtered = await (await filteredResponse).json();
  assert(filtered.points.every((p) => p.operator === "Orange"));
  report.filters = "PASS";
  await canvas.evaluate((n) => (n.dataset.instanceCheck = "same"));
  const beforeFull = reqs.length;
  await page.getByRole("button", { name: "Plein écran carte", exact: true }).click();
  await page.waitForTimeout(300);
  assert((await canvas.boundingBox()).width > 1600);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  assert.equal(await canvas.getAttribute("data-instance-check"), "same");
  assert.equal(reqs.length, beforeFull);
  const handle = page.getByRole("separator", { name: "Redimensionner la hauteur de la carte" });
  await handle.press("ArrowDown");
  await page.waitForTimeout(200);
  assert.equal(reqs.length, beforeFull);
  report.fullscreenResize = "PASS";
  await page.setViewportSize({ width: 400, height: 900 });
  await page.waitForTimeout(300);
  assert(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
  await page.screenshot({ path: out + "/400.png", fullPage: true });
  await page.getByRole("button", { name: "Carte", exact: true }).click();
  await page.getByRole("button", { name: "Carte", exact: true }).click();
  await page.getByLabel("Légende des mesures").waitFor();
  await page.waitForTimeout(700);
  report.toggleWithPoints = "PASS";
  assert.deepEqual(errors, []);
  report.result = "PASS";
} catch (e) {
  report.result = "FAIL";
  report.error = e.stack;
  await page.screenshot({ path: out + "/failure.png", fullPage: true });
  process.exitCode = 1;
} finally {
  fs.writeFileSync(out + "/browser.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
}
