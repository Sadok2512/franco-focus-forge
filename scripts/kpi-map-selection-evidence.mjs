import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { chromium } from "playwright";

const FRONT = process.env.BC4_FRONT_BASE ?? "http://127.0.0.1:9183";
const PROJECT_ID = "43e81a34a073";
const METRIC = "cell_rsrp@lte-type-0";
const CAPTURES = (process.env.BC4_MAP_CAPTURES ?? "a4b0c321c52e,ecffb18dbd7f").split(",");
const OUT = process.env.BC4_EVIDENCE_DIR ?? "artifacts/kpi-header-v2-templates/map-selection";
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

const tabId = "bc4-header-v2-map-proof";
const tabs = btoa(
  JSON.stringify({
    t: [{ i: tabId, n: "Map regression", c: [], m: [METRIC], a: null, l: "auto", o: 0 }],
    a: tabId,
  }),
);

async function mapOperation(page, operation, argument = null) {
  return page.evaluate(
    ({ operation, argument }) => {
      const seenFibers = new Set();
      const seenMaps = new Set();
      const maps = [];
      const inspect = (value) => {
        if (!value || typeof value !== "object" || typeof value.getLayer !== "function" || seenMaps.has(value)) return;
        seenMaps.add(value);
        maps.push(value);
      };
      for (const element of document.querySelectorAll(".maplibregl-map")) {
        const key = Object.keys(element).find((name) => name.startsWith("__reactFiber$"));
        let root = key ? element[key] : null;
        while (root?.return) root = root.return;
        const stack = root ? [root] : [];
        while (stack.length) {
          const fiber = stack.pop();
          if (!fiber || seenFibers.has(fiber)) continue;
          seenFibers.add(fiber);
          inspect(fiber.stateNode);
          inspect(fiber.memoizedProps?.map);
          let hook = fiber.memoizedState;
          for (let guard = 0; hook && typeof hook === "object" && guard < 100; guard += 1) {
            inspect(hook.memoizedState);
            inspect(hook.memoizedState?.current);
            hook = hook.next;
          }
          if (fiber.child) stack.push(fiber.child);
          if (fiber.sibling) stack.push(fiber.sibling);
        }
      }
      const map = maps.find((candidate) => candidate.getLayer("metrics-v3"));
      if (!map) return null;
      if (operation === "frame") {
        const data = map.getSource("metrics-v3")?._data;
        let features = data?.features ?? [];
        if (!features.length) {
          try { features = map.querySourceFeatures("metrics-v3"); } catch {}
        }
        if (!features.length) {
          try { features = map.queryRenderedFeatures(undefined, { layers: ["metrics-v3"] }); } catch {}
        }
        const coordinates = features.map((feature) => feature.geometry?.coordinates).filter(Boolean);
        if (!coordinates.length) return false;
        map.fitBounds(
          [
            [Math.min(...coordinates.map((point) => point[0])), Math.min(...coordinates.map((point) => point[1]))],
            [Math.max(...coordinates.map((point) => point[0])), Math.max(...coordinates.map((point) => point[1]))],
          ],
          { padding: 120, duration: 0 },
        );
        return true;
      }
      if (operation === "state") {
        let queried = map.getSource("metric-cell-links-v1")?._data?.features ?? [];
        if (!queried.length) {
          try { queried = map.querySourceFeatures("metric-cell-links-v1"); } catch {}
        }
        const unique = new Map();
        for (const feature of queried) {
          const key = `${feature.properties?.project_id}:${feature.properties?.capture_id}:${feature.properties?.seq}:${feature.properties?.link_type}`;
          unique.set(key, feature);
        }
        return [...unique.values()].map((feature) => ({
          seq: Number(feature.properties?.seq),
          type: feature.properties?.link_type,
          confidence: feature.properties?.confidence,
        }));
      }
      if (operation === "targets") {
        const rect = map.getCanvas().getBoundingClientRect();
        let rendered = [];
        try { rendered = map.queryRenderedFeatures(undefined, { layers: ["metrics-v3"] }); } catch {}
        const pixels = new Set();
        return rendered.flatMap((feature) => {
          const point = map.project(feature.geometry.coordinates);
          const pixel = `${Math.round(point.x)},${Math.round(point.y)}`;
          if (pixels.has(pixel) || point.x < 15 || point.y < 15 || point.x > rect.width - 15 || point.y > rect.height - 15) return [];
          pixels.add(pixel);
          return [{ seq: Number(feature.properties?.seq), x: rect.left + point.x, y: rect.top + point.y }];
        });
      }
      return null;
    },
    { operation, argument },
  );
}

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await context.addInitScript(
  ({ session, projectId, tabs, tabId, metric }) => {
    localStorage.setItem("bc4.session", JSON.stringify(session));
    localStorage.setItem(`bc4.activeProject.v1.${session.user.email}`, JSON.stringify({ id: projectId, name: "Test_6" }));
    localStorage.setItem(`bc4.kpi.tabs.${projectId}`, tabs);
    localStorage.setItem(`bc3.metrics.views.${tabId}`, JSON.stringify({ [metric]: "map" }));
    localStorage.setItem(`bc3.metrics.pane.${tabId}`, "charts");
  },
  { session, projectId: PROJECT_ID, tabs, tabId, metric: METRIC },
);

const report = {};
try {
  for (const captureId of CAPTURES) {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${FRONT}/kpi?analysis_scope=capture&capture_id=${captureId}&tabs=${encodeURIComponent(tabs)}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.getByTestId("network-map-chrome").waitFor({ timeout: 120_000 });
    await page.waitForFunction(() => Number(document.querySelector('[data-view="map"]')?.getAttribute("data-point-count") ?? 0) > 0, undefined, { timeout: 120_000 });
    let framed = false;
    for (let attempt = 0; attempt < 30 && !framed; attempt += 1) {
      framed = (await mapOperation(page, "frame")) === true;
      if (!framed) await page.waitForTimeout(200);
    }
    assert.equal(framed, true, `${captureId}: unable to frame rendered points`);
    await page.waitForTimeout(1_000);
    const initial = await mapOperation(page, "state");
    assert.equal(initial.length, 0, `${captureId}: links visible before selection`);
    const targets = await mapOperation(page, "targets");
    assert(targets?.length > 1, `${captureId}: fewer than two rendered measurement points`);
    let firstTarget = null;
    let first = [];
    for (const target of targets) {
      await page.mouse.click(target.x, target.y);
      await page.waitForTimeout(120);
      const state = await mapOperation(page, "state");
      if (state.length === 1) { firstTarget = target; first = state; break; }
    }
    assert(firstTarget, `${captureId}: no linked rendered point selectable`);
    assert.equal(first.length, 1, `${captureId}: first click must render one link`);
    await page.getByTestId("network-map-chrome").screenshot({ path: `${OUT}/${captureId}-1.png`, timeout: 120_000 });

    let secondTarget = null;
    let replaced = [];
    for (const target of targets.filter((candidate) => candidate.seq !== first[0].seq)) {
      await page.mouse.click(target.x, target.y);
      await page.waitForTimeout(120);
      const state = await mapOperation(page, "state");
      if (state.length === 1 && state[0].seq !== first[0].seq) { secondTarget = target; replaced = state; break; }
    }
    assert(secondTarget, `${captureId}: no second linked rendered point selectable`);
    assert.equal(replaced.length, 1, `${captureId}: replacement must retain one link`);
    await page.mouse.click(secondTarget.x, secondTarget.y);
    await page.waitForTimeout(150);
    const deselected = await mapOperation(page, "state");
    assert.equal(deselected.length, 0, `${captureId}: same-point click must clear link`);
    await page.getByTestId("network-map-chrome").screenshot({ path: `${OUT}/${captureId}-0.png`, timeout: 120_000 });
    assert.deepEqual(errors, []);
    report[captureId] = { initial: initial.length, first, replaced, deselected: deselected.length, errors };
    await page.close();
  }
  console.log(JSON.stringify({ verdict: "PASS", report }, null, 2));
} finally {
  await browser.close();
}
