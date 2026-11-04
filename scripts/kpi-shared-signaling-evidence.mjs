import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.BC4_FRONT_BASE ?? "http://127.0.0.1:5174";
const out = process.env.BC4_AUDIT_OUT ?? "/home/devmat/BC4/audit/kpi-shared-signaling-1.138.13";
const projectId = "43e81a34a073";
const captureId = "a4b0c321c52e";
const session = JSON.parse(
  execFileSync(
    "docker",
    [
      "exec",
      "bc4-api-1",
      "python",
      "-c",
      'from app.db import SessionLocal; from app.models import AppUser,Project; from app.config import settings; from app.services.auth import create_token; import json; db=SessionLocal(); p=db.get(Project,"43e81a34a073"); u=db.get(AppUser,p.owner_id); token,exp=create_token(user_id=u.id,role=u.role,ttl_min=settings.jwt_ttl_min,secret=settings.jwt_secret); print(json.dumps({"token":token,"token_type":"Bearer","expires_at":exp.replace(microsecond=0).isoformat().replace("+00:00","Z"),"user":{"id":u.id,"email":u.email,"role":u.role,"active":u.active,"created_at":u.created_at.replace(microsecond=0).isoformat().replace("+00:00","Z"),"must_change_password":u.must_change_password}}))',
    ],
    { encoding: "utf8" },
  ),
);

await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(60_000);
const consoleErrors = [];
const apiErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("response", (response) => {
  if (response.url().includes("/api/") && response.status() >= 400)
    apiErrors.push({ status: response.status(), url: response.url() });
});

await page.addInitScript(
  ({ authSession, pid, cap }) => {
    localStorage.setItem("bc4.session", JSON.stringify(authSession));
    localStorage.setItem(
      `bc4.activeProject.v1.${authSession.user.email}`,
      JSON.stringify({ id: pid, name: "Test_6" }),
    );
    localStorage.setItem(`bc4.capture.v1.${pid}`, cap);
    for (const key of Object.keys(localStorage)) {
      if (
        key.startsWith("bc4.kpi.tabs.") ||
        key.startsWith("bc4.panelLayout.") ||
        key.startsWith("bc4.signaling.inspection-layout.")
      )
        localStorage.removeItem(key);
    }
  },
  { authSession: session, pid: projectId, cap: captureId },
);

await page.goto(`${base}/kpi`, { waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: /Affichage|Display/ }).click();
await page.getByRole("menuitem", { name: /Signalisation L3|L3 Signaling/ }).click();

const embedded = page.getByTestId("signaling-inspection-embedded");
await embedded.waitFor({ state: "visible" });
await embedded.getByRole("textbox", { name: /Search|Rechercher/ }).waitFor();
await embedded.getByTestId("sig-filter-layer").waitFor();
await embedded.getByRole("table").waitFor();
await embedded.getByTestId("signaling-inspector").waitFor();
assert.equal(await embedded.getByTestId("signaling-sidebar-rail").count(), 0);
assert.equal(
  await embedded
    .getByTestId("signaling-map-panel")
    .isVisible()
    .catch(() => false),
  false,
);
assert.equal(
  await embedded
    .getByTestId("signaling-timeline-panel")
    .isVisible()
    .catch(() => false),
  false,
);

const row = embedded.locator("tbody tr").first();
await row.waitFor();
const selectedSeq = Number(await row.getAttribute("data-seq"));
assert(Number.isFinite(selectedSeq));
await row.click();
await embedded.getByTestId("inspector-tabs").waitFor();
for (const tab of ["payload", "paramtres", "callflow", "dtails"]) {
  assert.equal(await embedded.getByTestId(`inspector-tab-${tab}`).count(), 1);
}
const interfaceSignature = async (scope) => ({
  filters: await scope
    .locator(".sig-toolbar input, .sig-toolbar select")
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label"))),
  columns: await scope
    .locator(".sig-table thead th")
    .evaluateAll((nodes) => nodes.map((node) => node.textContent?.replace(/\s+/g, " ").trim())),
  tabs: await scope.getByTestId("inspector-tabs").locator('[role="tab"]').allTextContents(),
});
const embeddedSignature = await interfaceSignature(embedded);

const separator = embedded.getByRole("separator", {
  name: /Taille de la liste et du décodeur/,
});
await separator.focus();
await separator.press("ArrowLeft");
await page.waitForTimeout(250);
const layoutEntry = await page.evaluate(() =>
  Object.entries(localStorage).find(([key]) =>
    key.startsWith("bc4.signaling.inspection-layout.v1."),
  ),
);
assert(layoutEntry, "the internal split layout was not persisted");

const viewports = [];
for (const width of [1600, 1280, 760]) {
  await page.setViewportSize({ width, height: 1000 });
  await page.waitForTimeout(200);
  const box = await embedded.boundingBox();
  assert(box && box.width <= width + 1, `embedded signaling overflows at ${width}px`);
  const path = `${out}/kpi-l3-${width}.png`;
  await page.screenshot({ path, fullPage: true });
  viewports.push({ width, panel: box, screenshot: path });
}

await page.reload({ waitUntil: "domcontentloaded" });
const restored = page.getByTestId("signaling-inspection-embedded");
await restored.waitFor({ state: "visible" });
await restored.getByTestId("signaling-inspector").waitFor();
await restored.getByText(`#${selectedSeq}`, { exact: false }).first().waitFor();

const report = {
  base,
  projectId,
  captureId,
  selectedSeq,
  viewports,
  layoutEntry,
  interfaceSignature: embeddedSignature,
  consoleErrors,
  apiErrors,
  verdict: consoleErrors.length === 0 && apiErrors.length === 0 ? "PASS" : "FAIL",
};
await writeFile(`${out}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
await browser.close();
if (report.verdict !== "PASS") throw new Error(JSON.stringify(report));
console.log(JSON.stringify(report, null, 2));
