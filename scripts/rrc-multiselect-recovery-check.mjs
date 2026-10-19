import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import assert from "node:assert/strict";
const out = "rrc-recovery-evidence";
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

const report = {};
const failures = { distribution: 0, map: 0 };
const keys = [
  "rrcConnectionRelease/rrcConnectionRelease-r8/idleModeMobilityControlInfo/t320",
  "rrcConnectionRelease/rrcConnectionRelease-r8/idleModeMobilityControlInfo/freqPriorityListEUTRA/carrierFreq",
  "rrcConnectionRelease/rrcConnectionRelease-r8/idleModeMobilityControlInfo/freqPriorityListGERAN/carrierFreqs/bandIndicator",
];
const isTriple = (r) => new URL(r.url()).searchParams.get("keys")?.split(",").length === 3;
try {
  for (const endpoint of ["distribution", "map"])
    await page.route("**/dict/v2/" + endpoint + "?**", async (route) => {
      if (isTriple(route.request()) && failures[endpoint] === 0) {
        failures[endpoint]++;
        await route.fulfill({ status: 502, contentType: "text/plain", body: "Bad Gateway" });
      } else await route.continue();
    });
  await page.goto("http://localhost:5174/rrc", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Carte", exact: true }).click();
  const recoveredDistribution = page.waitForResponse(
    (r) => r.url().includes("/dict/v2/distribution?") && isTriple(r) && r.status() === 200,
  );
  const recoveredMap = page.waitForResponse(
    (r) => r.url().includes("/dict/v2/map?") && isTriple(r) && r.status() === 200,
  );
  for (const key of keys) {
    const name = key.split("/").at(-1);
    await page.getByTestId("dict-tree-search").fill(name);
    await page
      .getByTestId("dict-leaf-" + name)
      .filter({ has: page.locator('[title="' + key + '"]') })
      .first()
      .locator("input[type=checkbox]")
      .check();
  }
  const dist = await (await recoveredDistribution).json();
  const mapped = await (await recoveredMap).json();
  assert.equal(dist.blocks.length, 3);
  assert.equal(failures.distribution, 1);
  assert.equal(failures.map, 1);
  await page.waitForTimeout(400);
  assert.equal(await page.locator('[data-testid^="dict-chart-"]').count(), 3);
  assert(!(await page.locator("body").innerText()).includes("Bad Gateway"));
  assert(
    !(await page.locator("body").innerText()).includes(
      "Connexion au serveur temporairement indisponible",
    ),
  );
  await page.getByTestId("dict-tree-search").fill("");
  assert.match(await page.getByTestId("dict-selected-count").innerText(), /3/);
  report.recovery = {
    failures,
    blocks: dist.blocks.length,
    points: mapped.points.length,
    selected: 3,
  };
  await page.screenshot({ path: out + "/recovered.png", fullPage: true });
  assert.deepEqual(errors, []);
  report.result = "PASS";
} catch (e) {
  report.result = "FAIL";
  report.error = e.stack;
  process.exitCode = 1;
  await page.screenshot({ path: out + "/failure.png", fullPage: true });
} finally {
  fs.writeFileSync(out + "/browser.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
}
