import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const base = process.env.BC4_FRONT_BASE ?? "http://127.0.0.1:9183";
const projectId = "43e81a34a073";
const captureId = "a4b0c321c52e";
const email = "bc4a4-popup@example.test";
const password = "bc4a4-popup-disposable-password";
const out = new URL("../audit/bc4-map-point-popup/", import.meta.url).pathname;
await mkdir(out, { recursive: true });

const center = { lng: 2.996835, lat: 50.373261 };
const mapPoints = Array.from({ length: 9 }, (_, index) => {
  const dx = (index % 3) - 1;
  const dy = Math.floor(index / 3) - 1;
  return {
    seq: 4200 + index,
    lat: center.lat + dy * 0.001,
    lng: center.lng + dx * 0.001,
    code: "cell_rsrp@lte-type-0",
    value: -91 - index,
    t_rel_s: 65.125 + index / 10,
    tooltip: `RSRP ${-91 - index} dBm`,
    serving_cell_id: "2080111745802",
    serving_cell_ref_id: "fixture-serving",
    serving_site_id: "fixture-site-serving",
    serving_site_name: "DOUAI CENTRE",
    serving_cell_lat: center.lat + 0.012,
    serving_cell_lng: center.lng + 0.014,
    serving_cell_pci: 196,
    serving_cell_arfcn: 1675,
    serving_link_distance_m: 412,
    serving_link_confidence: "proven_operator_eci",
    serving_cell_source: "chi_previous_seq_operator_eci",
    neighbour_links: [
      {
        system: "LTE",
        arfcn: 1675,
        reference_channel: 1675,
        pci: 195,
        cell_type: 2,
        cell_ref_id: "fixture-neighbour",
        site_id: "fixture-site-neighbour",
        site_name: "DOUAI NORD",
        lat: center.lat - 0.012,
        lng: center.lng + 0.015,
        distance_m: 859,
        max_distance_m: 25000,
        candidate_count: 2,
        link_method: "earfcn_pci",
        value: -98,
        unit: "dBm",
        confidence: "radio_arfcn_pci_nearest_within_25000m",
      },
    ],
    nr_anchor_link: {
      system: "NR",
      arfcn: 643392,
      reference_channel: 643392,
      pci: 7,
      cell_type: 199,
      cell_ref_id: "fixture-nr",
      site_id: "fixture-site-nr",
      site_name: "DOUAI NR",
      lat: center.lat + 0.015,
      lng: center.lng - 0.014,
      distance_m: 1200,
      max_distance_m: 25000,
      candidate_count: 1,
      link_method: "earfcn_pci",
      confidence: "radio_arfcn_pci_unique",
    },
  };
});

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
await page.goto(`${base}/login`, { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.getByLabel(/Adresse e-mail|Email address/).fill(email);
await page.getByLabel(/Mot de passe|Password/, { exact: true }).fill(password);
await page.getByRole("button", { name: /Se connecter|Sign in/, exact: true }).click();
await page.waitForURL((url) => url.pathname !== "/login", { timeout: 30_000 });
await page.evaluate(
  ({ pid, cid, user }) => {
    localStorage.setItem(
      `bc4.activeProject.v1.${user}`,
      JSON.stringify({ id: pid, name: "Test_6" }),
    );
    localStorage.setItem(`bc4.activeCapture.${pid}`, cid);
    localStorage.setItem(`bc4.driveRsrp.lastCapture.${pid}`, cid);
    localStorage.setItem(
      "bc4.map.sitesLayer.v4",
      JSON.stringify({
        enabled: false,
        cellsEnabled: false,
        display: { beams: true, labels: true, beamSize: 50, beamIntensity: 28 },
        filters: { technos: [], bands: [], operators: [] },
      }),
    );
  },
  { pid: projectId, cid: captureId, user: email },
);

await page.route(`**/api/projects/${projectId}/metrics/table?*`, async (route) => {
  const response = await route.fetch();
  const analysis = await response.json();
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ...analysis, map_points: mapPoints }),
  });
});
await page.route(`**/api/projects/${projectId}/metrics/map?*`, async (route) => {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      project_id: projectId,
      capture_id: captureId,
      result_id: "bc4a4-popup-fixture",
      decoder_version: "test",
      total_points: mapPoints.length,
      map_points: mapPoints,
    }),
  });
});

const report = {
  base,
  projectId,
  captureId,
  fixture: { points: mapPoints.length },
  popups: {},
  lines: {},
};

async function clickMeasurementPoint(scope = page) {
  const canvas = scope.locator(".maplibregl-canvas").first();
  await canvas.waitFor({ state: "visible", timeout: 120_000 });
  await page.waitForTimeout(2500);
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Map canvas has no bounding box");
  const offsets = [0, -8, 8, -16, 16, -24, 24, -40, 40, -64, 64];
  for (const y of offsets) {
    for (const x of offsets) {
      await page.mouse.click(box.x + box.width / 2 + x, box.y + box.height / 2 + y);
      if (
        await page
          .locator(".measurement-point-popup")
          .isVisible()
          .catch(() => false)
      )
        return;
    }
  }
  await page.screenshot({ path: `${out}debug-no-popup.png`, fullPage: true });
  throw new Error(
    `No measurement popup found around map centre: ${(await page.locator("body").innerText()).slice(-1200)}`,
  );
}

async function capturePopup(path, name) {
  const metricResponse = page.waitForResponse(
    (response) => response.url().includes("/metrics/table?") && response.status() === 200,
    { timeout: 120_000 },
  );
  await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page
    .getByTestId("network-map-chrome")
    .first()
    .waitFor({ state: "visible", timeout: 180_000 });
  await metricResponse;
  await page.waitForTimeout(1000);
  await clickMeasurementPoint();
  const popup = page.locator(".measurement-point-popup");
  const text = await popup.innerText();
  const complete = ["-95", "DOUAI CENTRE", "PCI 196", "EARFCN 1675", "DOUAI NORD", "PCI 195"].every(
    (needle) => text.includes(needle),
  );
  report.popups[name] = { complete, text };
  await page.screenshot({ path: `${out}${name}.png`, fullPage: true });
}

await capturePopup(`/map?capture_id=${captureId}`, "map-popup");
await capturePopup(`/signaling?capture_id=${captureId}`, "signaling-popup");

await page.goto(`${base}/kpi`, { waitUntil: "domcontentloaded", timeout: 120_000 });
const metricsTab = page.getByRole("tab", { name: /^Metrics/ });
await metricsTab.waitFor({ state: "visible", timeout: 180_000 });
await metricsTab.click();
const search = page.getByRole("textbox", { name: /Search metrics|Rechercher.*métr/i }).first();
await search.fill("RSRP");
const leafButton = page
  .getByTestId("unified-metrics-tree")
  .locator(".kpi-tree-leaf button[aria-pressed]:not([disabled])")
  .filter({ hasText: /RSRP.*Serving/i })
  .first();
await leafButton.waitFor({ state: "visible", timeout: 180_000 });
await leafButton.click();
const leaf = leafButton.locator("xpath=ancestor::*[contains(@class,'kpi-tree-leaf')][1]");
await leaf.locator("button.kpi-leaf-menu").click();
await page.getByRole("menuitem", { name: /^(Map|Carte)$/ }).click();
const card = page.locator("[data-view='map']").first();
await card.getByTestId("network-map-chrome").waitFor({ state: "visible", timeout: 120_000 });
await clickMeasurementPoint(card);
const kpiPopup = page.locator(".measurement-point-popup");
const kpiText = await kpiPopup.innerText();
report.popups.kpi = {
  complete: ["-95", "DOUAI CENTRE", "PCI 196", "EARFCN 1675", "DOUAI NORD", "PCI 195"].every(
    (needle) => kpiText.includes(needle),
  ),
  text: kpiText,
};
await page.screenshot({ path: `${out}kpi-popup.png`, fullPage: true });

await page.keyboard.press("Escape");
const settings = card.getByRole("button", {
  name: /Metric map settings|Réglages de la carte métrique/,
});
await settings.click();
const legend = card.getByTestId("measurement-link-style-legend");
await legend.waitFor({ state: "visible" });
const legendText = await legend.innerText();
report.lines = {
  legendText,
  solid: /Solid|Plein/.test(legendText),
  dashed: /Dashed|Pointillés/.test(legendText),
  serving: await card.getByLabel(/Serving cell|Cellule servante/).isChecked(),
  neighbour: await card.getByLabel(/Neighbour cells|Cellules voisines/).isChecked(),
  nrAnchor: await card.getByLabel(/NR anchor|Ancre NR/).isChecked(),
};
await page.screenshot({ path: `${out}link-styles-solid-dashed.png`, fullPage: true });

const pass =
  Object.values(report.popups).every((popup) => popup.complete) &&
  report.lines.solid &&
  report.lines.dashed &&
  report.lines.serving &&
  report.lines.neighbour &&
  report.lines.nrAnchor;
report.verdict = pass ? "PASS" : "FAIL";
await writeFile(`${out}report.json`, `${JSON.stringify(report, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify(report, null, 2));
console.log(`VERDICT=${report.verdict}`);
process.exitCode = pass ? 0 : 1;
