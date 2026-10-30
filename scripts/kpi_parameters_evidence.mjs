import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";

const base = process.env.BC4_FRONT_BASE ?? "http://127.0.0.1:5175";
const apiContainer = process.env.BC4_API_CONTAINER ?? "bc4a4-api";
const projectId = process.env.BC4_PROJECT_ID ?? "43e81a34a073";
const captureId = process.env.BC4_CAPTURE_ID ?? "a4b0c321c52e";
const mode = process.argv[2] ?? "after";
const out = new URL(`../audit/bc4-kpi-parameters-tab/${mode}/`, import.meta.url).pathname;
await mkdir(out, { recursive: true });

const token = execFileSync(
  "docker",
  [
    "exec",
    apiContainer,
    "python",
    "-c",
    "from app.config import settings; from app.services.auth import create_token; print(create_token(user_id='adm-be45f070eba8',role='admin',ttl_min=30,secret=settings.jwt_secret)[0])",
  ],
  { encoding: "utf8" },
).trim();

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addInitScript(
  ({ sessionToken, activeProject, activeCapture }) => {
    localStorage.setItem(
      "bc4.session",
      JSON.stringify({
        token: sessionToken,
        token_type: "Bearer",
        expires_at: new Date(Date.now() + 1_800_000).toISOString(),
        user: {
          id: "adm-be45f070eba8",
          email: "admin@bc4.local",
          role: "admin",
          active: true,
          created_at: "2026-10-15T14:22:08Z",
        },
      }),
    );
    localStorage.setItem(
      "bc4.activeProject.v1.admin@bc4.local",
      JSON.stringify({ id: activeProject, name: "Test_6" }),
    );
    localStorage.setItem(`bc4.activeCapture.${activeProject}`, activeCapture);
  },
  { sessionToken: token, activeProject: projectId, activeCapture: captureId },
);

const page = await context.newPage();
const requests = [];
const responses = [];
page.on("request", (request) => {
  if (["fetch", "xhr"].includes(request.resourceType())) requests.push(request.url());
});
page.on("response", (response) => {
  if (["fetch", "xhr"].includes(response.request().resourceType())) {
    responses.push({ url: response.url(), status: response.status() });
  }
});

await page.goto(`${base}/rrc`, { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.getByTestId("dict-tree-search").waitFor({ state: "visible", timeout: 120_000 });
await page
  .getByTestId("dict-tree-scroll")
  .first()
  .getByText("Chargement…", { exact: true })
  .waitFor({ state: "hidden", timeout: 120_000 });
await page.screenshot({ path: `${out}rrc.png`, fullPage: true });

if (mode.startsWith("before")) {
  await writeFile(
    `${out}network.json`,
    `${JSON.stringify({ base, projectId, captureId, requests, responses }, null, 2)}\n`,
  );
  await browser.close();
  process.exit(0);
}

// Navigation RRC → KPI shares the already populated catalog tree query.
requests.length = 0;
responses.length = 0;
await page.getByText("KPI Analytics", { exact: true }).click();
await page.waitForURL(/\/kpi(?:\?|$)/, { timeout: 120_000 });
await page.getByRole("tab", { name: /^KPI(?: ·|$)/ }).waitFor({ timeout: 120_000 });
const tabNetwork = {};
for (const tab of ["KPI", "Metrics", "Parameters"]) {
  const requestStart = requests.length;
  const responseStart = responses.length;
  await page.getByRole("tab", { name: new RegExp(`^${tab}(?: ·|$)`) }).click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}tab-${tab.toLowerCase()}.png`, fullPage: true });
  tabNetwork[tab] = {
    requests: requests.slice(requestStart),
    responses: responses.slice(responseStart),
  };
}

await page.getByRole("tab", { name: /^KPI(?: ·|$)/ }).click();
const kpiAside = page.locator("aside.kpi-catalog").first();
await kpiAside.locator("input").fill("success");
await kpiAside
  .locator(".kpi-tree-leaf:has(.status-available) button[aria-pressed]:not([disabled])")
  .first()
  .click();
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}leaf-kpi.png`, fullPage: true });

await page.getByRole("tab", { name: /^Metrics(?: ·|$)/ }).click();
const metricAside = page.locator("aside.kpi-catalog").nth(1);
await metricAside.getByRole("textbox", { name: "Search metrics" }).fill("RSRP");
await metricAside.locator(".kpi-tree-leaf button[aria-pressed]:not([disabled])").first().click();
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}leaf-metrics.png`, fullPage: true });

await page.getByRole("tab", { name: /^Parameters(?: ·|$)/ }).click();
await page.getByTestId("dict-tree-search").fill("t300");
await page.getByTestId("catalog-leaf").first().click();
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}leaf-parameters.png`, fullPage: true });

const rawStart = requests.length;
await page.getByRole("tab", { name: "Raw parameter" }).click();
await page
  .getByTestId("dict-tree-scroll")
  .last()
  .getByText("Chargement…", { exact: true })
  .waitFor({ state: "hidden", timeout: 120_000 });
await page.screenshot({ path: `${out}parameters-raw.png`, fullPage: true });
tabNetwork["Raw parameter"] = { requests: requests.slice(rawStart) };

await writeFile(
  `${out}network.json`,
  `${JSON.stringify({ base, projectId, captureId, tabNetwork, requests, responses }, null, 2)}\n`,
);
await browser.close();
