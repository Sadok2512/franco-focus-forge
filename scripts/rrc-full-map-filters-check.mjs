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
  const height = (await page.locator(".rrc-main-filters").boundingBox()).height;
  assert(height >= 60 && height <= 75);
  assert(await page.getByRole("button", { name: "Filtres avancés", exact: true }).isDisabled());
  await page.getByRole("button", { name: /^Opérateur —/ }).click();
  await page.getByRole("button", { name: "Tout sélectionner", exact: true }).click();
  await page.keyboard.press("Escape");
  assert.match(await page.getByRole("button", { name: /^Opérateur —/ }).innerText(), /Tous/);
  await page.getByRole("button", { name: /^Opérateur —/ }).click();
  await page.getByRole("button", { name: "Effacer", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^Bande —/ }).click();
  await page.getByRole("textbox", { name: "Rechercher Bande" }).fill("nonexistent-band");
  await page.getByText("Aucune option", { exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Plier les filtres", exact: true }).click();
  assert(await page.locator("#rrc-filter-section").isHidden());
  await page.getByRole("button", { name: "Déplier les filtres", exact: true }).click();
  assert(await page.locator("#rrc-filter-section").isVisible());
  console.log(
    "PASS: main filter row " +
      height +
      "px, all-operator summary, searchable bands, collapse/expand, unavailable advanced dimensions disabled.",
  );
} finally {
  await browser.close();
}
