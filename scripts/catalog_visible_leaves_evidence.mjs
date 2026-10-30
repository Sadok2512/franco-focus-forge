import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.BC4_FRONT_BASE ?? "http://127.0.0.1:9183";
const apiContainer = process.env.BC4_API_CONTAINER ?? "bc4a4-api";
const projectId = process.env.BC4_PROJECT_ID ?? "43e81a34a073";
const captureId = process.env.BC4_CAPTURE_ID ?? "a4b0c321c52e";
const auditEmail = process.env.BC4_AUDIT_EMAIL ?? "bc4a4-test@local.invalid";
const mode = process.argv[2] ?? "current";
const out = new URL(`../audit/bc4-catalog-visible-leaves/${mode}/`, import.meta.url).pathname;
await mkdir(out, { recursive: true });

const session = JSON.parse(
  execFileSync(
    "docker",
    [
      "exec",
      apiContainer,
      "python",
      "-c",
      `import json; from app.config import settings; from app.db import SessionLocal; from app.models import AppUser; from app.services.auth import create_token; db=SessionLocal(); u=db.query(AppUser).filter(AppUser.email=='${auditEmail}').one(); token,exp=create_token(user_id=u.id,role=u.role,ttl_min=30,secret=settings.jwt_secret); print(json.dumps({'token':token,'token_type':'Bearer','expires_at':exp.isoformat(),'user':{'id':u.id,'email':u.email,'role':u.role,'active':u.active,'created_at':u.created_at.isoformat()}})); db.close()`,
    ],
    { encoding: "utf8" },
  ),
);

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addInitScript(
  ({ auth, project, capture }) => {
    localStorage.setItem("bc4.session", JSON.stringify(auth));
    localStorage.setItem(
      `bc4.activeProject.v1.${auth.user.email}`,
      JSON.stringify({ id: project, name: "Test_6" }),
    );
    localStorage.setItem(`bc4.activeCapture.${project}`, capture);
  },
  { auth: session, project: projectId, capture: captureId },
);

const page = await context.newPage();
const calls = [];
page.on("response", (response) => {
  if (["fetch", "xhr"].includes(response.request().resourceType())) {
    calls.push({ url: response.url(), status: response.status() });
  }
});

await page.goto(`${base}/rrc`, { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.getByTestId("dict-tree-search").waitFor({ state: "visible", timeout: 120_000 });
await page.waitForTimeout(2_000);
await page.addStyleTag({
  content: "* { caret-color: transparent !important; animation: none !important; }",
});
await page.screenshot({ path: `${out}rrc.png`, fullPage: true, animations: "disabled" });
const rrcContract = {
  heading: await page.getByText("Paramètres RRC", { exact: true }).textContent(),
  tabs: await page.getByTestId("dict-tree-tabs").getByRole("tab").allTextContents(),
  searchPlaceholder: await page.getByTestId("dict-tree-search").getAttribute("placeholder"),
  templatesTabCount: await page.getByRole("tab", { name: "Templates" }).count(),
};

if (mode === "baseline") {
  await writeFile(
    `${out}report.json`,
    `${JSON.stringify({ base, mode, rrcContract, calls }, null, 2)}\n`,
  );
  await browser.close();
  process.exit(0);
}

await page.goto(`${base}/kpi`, { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.getByRole("tab", { name: /^Metrics/ }).click();
const aside = page.locator("aside.kpi-catalog").nth(1);
const unavailableSwitch = aside.getByTestId("metrics-show-unavailable").getByRole("switch");
await unavailableSwitch.waitFor({ state: "visible", timeout: 120_000 });
await aside
  .getByTestId("metrics-catalog-footer")
  .getByText(/2\.59\.0/)
  .waitFor({ state: "visible", timeout: 120_000 });
const tabName = await page.getByRole("tab", { name: /^Metrics/ }).getAttribute("aria-label");
const offChecked = await unavailableSwitch.isChecked();
await page.screenshot({ path: `${out}metrics-available-only.png`, fullPage: true });

await unavailableSwitch.check();
const onChecked = await unavailableSwitch.isChecked();
await page.screenshot({ path: `${out}metrics-with-unavailable.png`, fullPage: true });

await unavailableSwitch.uncheck();
const catalogResponse = await fetch(`${base}/api/projects/${projectId}/metrics`, {
  headers: { Authorization: `Bearer ${session.token}` },
});
if (!catalogResponse.ok) throw new Error(`catalog HTTP ${catalogResponse.status}`);
const catalog = await catalogResponse.json();
const supportedLeaf = catalog.nodes.find(
  (node) => node.node_type === "leaf" && node.selection === "rachi_rach_result",
);
if (!supportedLeaf?.selectable) throw new Error("rachi_rach_result is not selectable");
const cleanLabel = supportedLeaf.label
  .replace("★", "")
  .replace(/\s*\[[A-Z][A-Z0-9]*\s+#\d+\]\s*/g, "")
  .trim();
await aside.getByRole("textbox").fill(supportedLeaf.event);
const supportedButton = aside
  .getByText(cleanLabel, { exact: true })
  .first()
  .locator("xpath=ancestor::button[1]");
await supportedButton.waitFor({ state: "visible", timeout: 30_000 });
await supportedButton.click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}supported-leaf-open.png`, fullPage: true });

const report = {
  base,
  mode,
  projectId,
  captureId,
  catalogRelease: catalog.catalog_release?.version ?? null,
  tabName,
  toggleDefaultChecked: offChecked,
  toggleEnabledChecked: onChecked,
  supportedLeaf: {
    selection: supportedLeaf.selection,
    event: supportedLeaf.event,
    selectable: supportedLeaf.selectable,
  },
  rrcContract,
  calls,
};
await writeFile(`${out}report.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `CATALOG=${report.catalogRelease} TAB=${tabName} DEFAULT=${offChecked} ENABLED=${onChecked} LEAF=${supportedLeaf.selection} SELECTABLE=${supportedLeaf.selectable} VERDICT=PASS`,
);
await browser.close();
