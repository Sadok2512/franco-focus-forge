import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { chromium } from "playwright";

const FRONT = process.env.BC4_FRONT_BASE ?? "http://127.0.0.1:9183";
const API = `${FRONT}/api`;
const PROJECT_ID = "43e81a34a073";
const CAPTURES = ["a4b0c321c52e", "ecffb18dbd7f"];
const OUT = process.env.BC4_EVIDENCE_DIR ?? "artifacts/kpi-header-v2-templates";
fs.mkdirSync(OUT, { recursive: true });

const session = JSON.parse(
  execFileSync(
    "docker",
    [
      "exec",
      "bc4a4-header-api",
      "python",
      "-c",
      [
        "import json",
        "from app.services.auth import create_token",
        "t,e=create_token(user_id='adm-be45f070eba8',role='admin',ttl_min=120,secret='bc4a4-header-test-jwt-not-production')",
        "print(json.dumps({'token':t,'token_type':'Bearer','expires_at':e.isoformat(),'user':{'id':'adm-be45f070eba8','email':'admin@bc4.local','role':'admin','active':True,'created_at':'2026-01-01T00:00:00Z','must_change_password':False}}))",
      ].join(";"),
    ],
    { encoding: "utf8" },
  ),
);

const auth = { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" };
async function api(path, init = {}) {
  const response = await fetch(`${API}${path}`, { ...init, headers: { ...auth, ...init.headers } });
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${path}: HTTP ${response.status} ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

async function ensureSuperstream() {
  const all = await api(`/projects/${PROJECT_ID}/superstreams`);
  const existing = all.find((item) => item.name === "Header V2 E2E");
  if (existing) return existing;
  return api(`/projects/${PROJECT_ID}/superstreams`, {
    method: "POST",
    body: JSON.stringify({ name: "Header V2 E2E", captureIds: CAPTURES }),
  });
}

const superstream = await ensureSuperstream();
for (const template of await api(`/projects/${PROJECT_ID}/workspace-templates`)) {
  if (template.name.startsWith("Header V2 proof")) {
    await api(`/projects/${PROJECT_ID}/workspace-templates/${template.id}`, {
      method: "DELETE",
      headers: { "If-Match": String(template.revision) },
    });
  }
}
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(60_000);
const pageErrors = [];
const failedResponses = [];
const analyticRequests = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
page.on("response", (response) => {
  if (response.status() >= 400) failedResponses.push({ status: response.status(), url: response.url() });
});
page.on("request", (request) => {
  if (/\/metrics\/(map|table)|\/kpi\/(events|catalog)/.test(request.url())) analyticRequests.push(request.url());
});
await page.addInitScript(
  ({ s, pid }) => {
    localStorage.setItem("bc4.session", JSON.stringify(s));
    localStorage.setItem(
      `bc4.activeProject.v1.${s.user.email}`,
      JSON.stringify({ id: pid, name: "Test_6" }),
    );
  },
  { s: session, pid: PROJECT_ID },
);

const results = {};
try {
  await page.goto(
    `${FRONT}/kpi?analysis_scope=capture&capture_id=${CAPTURES[0]}`,
    { waitUntil: "domcontentloaded", timeout: 60_000 },
  );
  const header = page.getByRole("region", { name: "KPI Analytics Header V2" });
  await header.waitFor();
  await page.getByTestId("kpi-source-selector").waitFor();
  await page.waitForTimeout(2_000);

  const headerText = await header.innerText();
  const normalizedHeaderText = headerText.toLowerCase();
  const positions = ["stream / capture", "technology", "operator", "templates", "events", "reset", "apply"].map((label) => normalizedHeaderText.indexOf(label));
  assert(positions.every((position) => position >= 0), `missing header item: ${headerText}`);
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, "Header V2 order differs");
  for (const removed of ["Geographic Area", "Period", "Advanced Filters"]) {
    assert(!headerText.includes(removed), `${removed} remains in upper header`);
  }
  assert.deepEqual(
    await header.getByRole("group", { name: "Technology" }).getByRole("button").allTextContents(),
    ["LTE", "NR", "LTE + NR"],
  );
  results.header = "PASS";
  await page.screenshot({ path: `${OUT}/01-header-v2-capture.png`, fullPage: true });

  const timeline = page.locator(".kpi-events-section, [data-testid='metrics-events-ribbon']");
  const initialTimelineCount = await timeline.count();
  const callsBeforeToggle = analyticRequests.length;
  await page.getByTestId("kpi-events-toggle").click();
  await page.waitForTimeout(350);
  assert.equal(await timeline.count(), 0, "Timeline remained mounted while Events OFF");
  await page.getByTestId("kpi-events-toggle").click();
  await page.waitForTimeout(350);
  assert((await timeline.count()) >= initialTimelineCount, "Timeline did not return");
  assert.equal(analyticRequests.length, callsBeforeToggle, "Events toggle reloaded analytic panels");
  results.events = "PASS";

  await page.getByTestId("workspace-settings-open").click();
  await page.getByRole("button", { name: "Save as Template" }).click();
  await page.getByLabel(/Nom|Name/).fill("Header V2 proof");
  await page.getByLabel(/Description/).fill("Reusable real-data workspace");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByText(/(?:Actif|Active): Header V2 proof/).waitFor();
  await page.screenshot({ path: `${OUT}/02-template-saved.png`, fullPage: true });
  results.save = "PASS";

  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByTestId("workspace-templates-trigger").click();
  const templateEntry = page
    .getByRole("menu")
    .getByText("Header V2 proof", { exact: true });
  await templateEntry.hover();
  await page.getByRole("menuitem", { name: /Prévisualiser|Preview/ }).click();
  await page.getByTestId("workspace-template-preview").waitFor();
  await page.screenshot({ path: `${OUT}/03-template-preview.png`, fullPage: true });
  await page.keyboard.press("Escape");
  results.preview = "PASS";

  await page.getByTestId("workspace-layout-select").getByRole("combobox").selectOption("2");
  await page.getByTestId("workspace-settings-open").click();
  const update = page.getByRole("button", { name: "Update Template" });
  assert(!(await update.isDisabled()), "Update Template must be available for a dirty workspace");
  await update.click();
  await page.getByRole("button", { name: /Confirmer|Confirm/ }).click();
  await page.getByText(/(?:révision|revision) 2/).waitFor();
  results.update = "PASS";

  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByTestId("workspace-layout-select").getByRole("combobox").selectOption("1");
  await page.getByTestId("workspace-templates-trigger").click();
  await page.getByRole("menu").getByText("Header V2 proof", { exact: true }).hover();
  await page.getByRole("menuitem", { name: /Appliquer|Apply/ }).click();
  await page.getByRole("button", { name: /Appliquer|Apply/ }).click();
  await page.waitForFunction(
    () => document.querySelector('[data-testid="workspace-layout-select"] select')?.value === "2",
  );
  results.apply = "PASS";

  await page.getByTestId("workspace-settings-open").click();
  await page.getByRole("button", { name: "Rename" }).click();
  const nameInput = page.getByLabel(/Nom|Name/);
  await nameInput.fill("Header V2 proof renamed");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByText(/(?:Actif|Active): Header V2 proof renamed/).waitFor();
  results.rename = "PASS";
  await page.getByRole("button", { name: "Cancel", exact: true }).click();

  await page.getByTestId("workspace-tab-add").click();
  assert.equal(await page.getByTestId("workspace-tab-1").getAttribute("aria-selected"), "true");
  assert((await page.getByTestId("workspace-templates-trigger").innerText()).includes("Templates"));
  await page.getByTestId("workspace-tab-0").getByRole("button").first().click();
  assert((await page.getByTestId("workspace-templates-trigger").innerText()).includes("Header V2 proof renamed"));
  results.workspaceIsolation = "PASS";

  await page.getByTestId("kpi-source-selector").selectOption(`superstream:${superstream.id}`);
  await page.waitForURL(/analysis_scope=superstream/);
  await page.waitForTimeout(2_000);
  const boundaryText = await page.locator("body").innerText();
  assert(boundaryText.includes(CAPTURES[0]) && boundaryText.includes(CAPTURES[1]), "capture provenance boundaries missing");
  await page.screenshot({ path: `${OUT}/04-superstream-boundaries.png`, fullPage: true });
  results.superstream = "PASS";

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByTestId("workspace-templates-trigger").waitFor();
  await page.waitForFunction(
    () => document.querySelector('[data-testid="workspace-templates-trigger"]')?.textContent?.includes("Header V2 proof renamed"),
  );
  results.refresh = "PASS";

  await page.getByTestId("workspace-settings-open").click();
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: /Confirmer|Confirm/ }).click();
  await page.getByText(/Aucun template actif|No active template/).waitFor();
  results.delete = "PASS";
  await page.getByRole("button", { name: "Cancel", exact: true }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const overflow = await header.evaluate((element) => element.scrollWidth - element.clientWidth);
  assert(overflow <= 1, `Header horizontal overflow: ${overflow}px`);
  await page.screenshot({ path: `${OUT}/05-header-responsive-390.png`, fullPage: true });
  results.responsive = "PASS";

  assert.deepEqual(pageErrors, [], `page errors: ${JSON.stringify(pageErrors)}`);
  assert.deepEqual(failedResponses, [], `HTTP failures: ${JSON.stringify(failedResponses)}`);
  console.log(JSON.stringify({ verdict: "PASS", superstream: superstream.id, results, pageErrors, failedResponses }, null, 2));
} finally {
  await browser.close();
}
