import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import assert from "node:assert/strict";
const out = "rrc-full-map-evidence";
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
  await page.getByRole("button", { name: "Carte", exact: true }).click();
  const panel = page.getByRole("region", { name: "Carte des mesures RRC", exact: true });
  const canvas = panel.locator(".maplibregl-canvas");
  await canvas.waitFor();
  await canvas.evaluate((n) => (n.dataset.instanceCheck = "same"));
  await panel.locator(".maplibregl-ctrl-zoom-in").click();
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2 + 20);
  await page.mouse.up();
  await panel.getByRole("button", { name: "Recherche géographique par coordonnées" }).click();
  await panel.getByRole("textbox", { name: "Latitude, longitude" }).fill("999, 0");
  await panel.getByRole("button", { name: "Aller", exact: true }).click();
  await panel.getByRole("alert").waitFor();
  await panel.getByRole("textbox", { name: "Latitude, longitude" }).fill("48.8566, 2.3522");
  await panel.getByRole("button", { name: "Aller", exact: true }).click();
  await panel.getByRole("button", { name: "Recentrer la carte" }).click();
  await panel.getByRole("button", { name: "Couches cartographiques" }).click();
  await panel.getByRole("checkbox", { name: "Fond OpenStreetMap" }).uncheck();
  await panel.getByRole("checkbox", { name: "Fond OpenStreetMap" }).check();
  await panel.getByRole("button", { name: "Couches cartographiques" }).click();
  const count = requests.length;
  await page.getByRole("button", { name: "Plein écran carte", exact: true }).click();
  await page.waitForTimeout(250);
  assert((await canvas.boundingBox()).width > 1500);
  assert.equal(await canvas.getAttribute("data-instance-check"), "same");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  assert((await canvas.boundingBox()).width < 1500);
  assert.equal(await canvas.getAttribute("data-instance-check"), "same");
  assert.equal(requests.length, count);
  assert((await panel.innerText()).includes("Aucun point géolocalisé"));
  assert.equal(await panel.getByText("Opérateurs", { exact: true }).count(), 0);
  assert.equal(await panel.locator(".maplibregl-marker").count(), 0);
  await page.screenshot({ path: out + "/rrc-basemap.png", fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: empty-population basemap, zoom/pan, fullscreen/Escape, same map instance, no fabricated markers/legend or extra distribution requests.",
  );
} finally {
  await browser.close();
}
