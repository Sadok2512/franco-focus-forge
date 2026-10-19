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
      JSON.stringify({ id: "4b7bfd50ddb6", name: "Test_3" }),
    );
  },
  { ...session, expires_at: session.expires_at ?? new Date(Date.now() + 3600000).toISOString() },
);

try {
  await page.goto("http://localhost:5174/rrc", { waitUntil: "networkidle" });
  await page.getByTestId("dict-tree-search").fill("mnc");
  const key =
    "systemInformationBlockType1/cellAccessRelatedInfo/plmn-IdentityList/plmn-Identity/mnc";
  await page
    .getByTestId("dict-leaf-mnc")
    .filter({ has: page.locator('[title="' + key + '"]') })
    .first()
    .locator("input[type=checkbox]")
    .check();
  const responsePromise = page.waitForResponse((r) => r.url().includes("/dict/v2/map?") && r.ok());
  await page.getByRole("button", { name: "Carte", exact: true }).click();
  const data = await (await responsePromise).json();
  assert.equal(data.points.length, 199);
  await page.getByLabel("Légende des mesures").waitFor();
  for (const name of ["Orange", "Free", "Bouygues"])
    assert((await page.getByLabel("Légende des mesures").innerText()).includes(name));
  await page.waitForTimeout(1800);
  await page.screenshot({ path: out + "/test3-real-points.png" });
  // Position of a visible cluster verified in the 1720x1080 screenshot above.
  await page.mouse.click(915, 249);
  await page.locator(".rrc-map-proof").waitFor();
  assert(
    (await page.getByRole("combobox", { name: "Occurrence RRC" }).locator("option").count()) > 1,
  );
  assert((await page.locator(".rrc-map-proof").innerText()).includes("param_occurrence:"));
  await page.getByRole("button", { name: "Zoomer sur le groupe" }).waitFor();
  await page.waitForTimeout(800);
  await page.screenshot({ path: out + "/test3-cluster-values.png" });

  const count = data.operators.reduce((n, o) => n + o.count, 0);
  assert.equal(count, 199);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: Test_3 SIB1 mnc, 199 traced occurrences, operator legend equals API, cluster popup with multiple traced values, no browser errors.",
  );
} finally {
  await browser.close();
}
