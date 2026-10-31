import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const base = process.env.BC4_FRONT_BASE ?? "http://185.248.33.125:5174";
const credentialsPath =
  process.env.BC4_READER_CREDENTIALS ?? "/home/devmat/BC4/secure/signaling-reader.credentials";
const credentials = Object.fromEntries(
  (await readFile(credentialsPath, "utf8"))
    .split(/\r?\n/)
    .filter((line) => line.includes("="))
    .map((line) => {
      const at = line.indexOf("=");
      return [line.slice(0, at), line.slice(at + 1)];
    }),
);
const email = process.env.BC4_AUDIT_EMAIL ?? credentials["BC4_READER_EMAIL"];
const password = process.env.BC4_AUDIT_PASSWORD_FILE
  ? (await readFile(process.env.BC4_AUDIT_PASSWORD_FILE, "utf8")).trim()
  : (process.env.BC4_AUDIT_PASSWORD ?? credentials["BC4_READER_PASSWORD"]);
if (!email || !password) throw new Error("reader credentials are incomplete");

const projectId = "43e81a34a073";
const captures = (process.env.BC4_AUDIT_CAPTURES ?? "a4b0c321c52e,ecffb18dbd7f")
  .split(",")
  .filter(Boolean);
const views = (process.env.BC4_AUDIT_VIEWS ?? "map,signaling,kpi").split(",").filter(Boolean);
const out = process.env.BC4_AUDIT_OUT
  ? `${process.env.BC4_AUDIT_OUT.replace(/\/$/, "")}/`
  : new URL("../audit/bc4-serving-links-visible/public-before/", import.meta.url).pathname;
await mkdir(out, { recursive: true });

function summarizeMetricPayload(url, status, payload) {
  const points = Array.isArray(payload?.map_points) ? payload.map_points : [];
  const confidence = {};
  for (const point of points) {
    const key = point?.serving_link_confidence ?? "<missing>";
    confidence[key] = (confidence[key] ?? 0) + 1;
  }
  return {
    url,
    status,
    points: points.length,
    servingCellRefId: points.filter((point) => Boolean(point?.serving_cell_ref_id)).length,
    servingCellLatLng: points.filter(
      (point) =>
        Number.isFinite(point?.serving_cell_lat) && Number.isFinite(point?.serving_cell_lng),
    ).length,
    servingConfidence: points.filter((point) => Boolean(point?.serving_link_confidence)).length,
    completeServing: points.filter(
      (point) =>
        Boolean(point?.serving_cell_ref_id) &&
        Number.isFinite(point?.serving_cell_lat) &&
        Number.isFinite(point?.serving_cell_lng) &&
        Boolean(point?.serving_link_confidence),
    ).length,
    probableServing: points.filter(
      (point) =>
        Boolean(point?.probable_serving_cell_ref_id) &&
        Number.isFinite(point?.probable_serving_cell_lat) &&
        Number.isFinite(point?.probable_serving_cell_lng),
    ).length,
    confidence,
    sample: points
      .filter((point) => point?.serving_cell_ref_id)
      .slice(0, 2)
      .map((point) => ({
        seq: point.seq,
        serving_cell_ref_id: point.serving_cell_ref_id,
        serving_cell_lat: point.serving_cell_lat,
        serving_cell_lng: point.serving_cell_lng,
        serving_link_confidence: point.serving_link_confidence,
        serving_cell_source: point.serving_cell_source,
      })),
  };
}

async function inspectMap(page) {
  return page.evaluate(() => {
    const seenFibers = new Set();
    const seenMaps = new Set();
    const maps = [];
    const candidates = document.querySelectorAll(".maplibregl-map");
    const inspectValue = (value) => {
      if (
        !value ||
        typeof value !== "object" ||
        typeof value.getStyle !== "function" ||
        typeof value.getSource !== "function" ||
        seenMaps.has(value)
      )
        return;
      seenMaps.add(value);
      const style = value.getStyle?.();
      const layerIds = (style?.layers ?? [])
        .map((layer) => layer.id)
        .filter((id) => /cell-links|serving-links/.test(id));
      const sourceIds = Object.keys(style?.sources ?? {}).filter((id) =>
        /cell-links|serving-links/.test(id),
      );
      const layers = layerIds.map((id) => {
        let rendered = null;
        let renderedByType = null;
        try {
          const renderedFeatures = value.queryRenderedFeatures(undefined, { layers: [id] });
          rendered = renderedFeatures.length;
          renderedByType = renderedFeatures.reduce((counts, feature) => {
            const key = feature?.properties?.link_type ?? "<missing>";
            counts[key] = (counts[key] ?? 0) + 1;
            return counts;
          }, {});
        } catch {}
        return {
          id,
          styleIndex: (style?.layers ?? []).findIndex((layer) => layer.id === id),
          visibility: value.getLayoutProperty(id, "visibility") ?? "visible",
          width: value.getPaintProperty(id, "line-width"),
          opacity: value.getPaintProperty(id, "line-opacity"),
          dasharray: value.getPaintProperty(id, "line-dasharray") ?? null,
          rendered,
          renderedByType,
        };
      });
      const sources = sourceIds.map((id) => {
        const source = value.getSource(id);
        const data = source?._data ?? source?._options?.data ?? null;
        const features = Array.isArray(data?.features) ? data.features : [];
        let tiledFeatures = [];
        try {
          const queried = value.querySourceFeatures(id);
          if (queried.length) tiledFeatures = queried;
        } catch {}
        const unique = new Map();
        for (const feature of tiledFeatures) {
          const coordinates = feature?.geometry?.coordinates ?? [];
          const key = JSON.stringify([
            feature?.properties?.seq,
            feature?.properties?.link_type,
            feature?.properties?.confidence,
            coordinates,
          ]);
          unique.set(key, feature);
        }
        const uniqueFeatures = [...unique.values()];
        const radioBySeq = new Map();
        for (const feature of uniqueFeatures) {
          const seq = feature?.properties?.seq;
          if (seq == null) continue;
          const group = radioBySeq.get(seq) ?? [];
          group.push(feature);
          radioBySeq.set(seq, group);
        }
        let servingSameGeometryAsOther = 0;
        let servingSameDestinationAsOther = 0;
        for (const group of radioBySeq.values()) {
          const servings = group.filter((feature) => feature?.properties?.link_type === "serving");
          const others = group.filter((feature) => feature?.properties?.link_type !== "serving");
          for (const serving of servings) {
            const geometry = JSON.stringify(serving?.geometry?.coordinates ?? []);
            const destination = JSON.stringify(serving?.geometry?.coordinates?.at?.(-1) ?? null);
            if (others.some((feature) => JSON.stringify(feature?.geometry?.coordinates ?? []) === geometry))
              servingSameGeometryAsOther += 1;
            if (
              others.some(
                (feature) =>
                  JSON.stringify(feature?.geometry?.coordinates?.at?.(-1) ?? null) === destination,
              )
            )
              servingSameDestinationAsOther += 1;
          }
        }
        return {
          id,
          features: features.length,
          tiledFeatures: tiledFeatures.length,
          uniqueFeatures: uniqueFeatures.length,
          uniqueServing: uniqueFeatures.filter(
            (feature) => feature?.properties?.link_type === "serving",
          ).length,
          servingSameGeometryAsOther,
          servingSameDestinationAsOther,
          serving: features.filter((feature) => feature?.properties?.link_type === "serving")
            .length,
          selected: features.filter((feature) => feature?.properties?.selected === true).length,
          hasSelection: features.filter((feature) => feature?.properties?.has_selection === true)
            .length,
          confidence: features.reduce((counts, feature) => {
            const key = feature?.properties?.confidence ?? "<missing>";
            counts[key] = (counts[key] ?? 0) + 1;
            return counts;
          }, {}),
        };
      });
      const pointLayer = value.getLayer("metrics-v3")
        ? "metrics-v3"
        : value.getLayer("bc4-drive-rsrp-points")
          ? "bc4-drive-rsrp-points"
          : null;
      let clickTarget = null;
      if (pointLayer) {
        try {
          const feature = value.queryRenderedFeatures(undefined, { layers: [pointLayer] })[0];
          if (feature?.geometry?.type === "Point") {
            const projected = value.project(feature.geometry.coordinates);
            const rect = value.getCanvas().getBoundingClientRect();
            clickTarget = { x: rect.left + projected.x, y: rect.top + projected.y, pointLayer };
          }
        } catch {}
      }
      maps.push({
        layerIds,
        sourceIds,
        layers,
        sources,
        styleOrder: (style?.layers ?? []).map((layer, index) => ({ index, id: layer.id })),
        clickTarget,
      });
    };
    for (const element of candidates) {
      const key = Object.keys(element).find((name) => name.startsWith("__reactFiber$"));
      let root = key ? element[key] : null;
      while (root?.return) root = root.return;
      const stack = root ? [root] : [];
      while (stack.length) {
        const fiber = stack.pop();
        if (!fiber || seenFibers.has(fiber)) continue;
        seenFibers.add(fiber);
        inspectValue(fiber.stateNode);
        inspectValue(fiber.memoizedProps?.map);
        let hook = fiber.memoizedState;
        let hookGuard = 0;
        while (hook && typeof hook === "object" && hookGuard++ < 100) {
          inspectValue(hook.memoizedState);
          hook = hook.next;
        }
        if (fiber.child) stack.push(fiber.child);
        if (fiber.sibling) stack.push(fiber.sibling);
      }
    }
    return maps;
  });
}

async function readDriveLinkToggles(page) {
  const button = page.getByRole("button", { name: /RSRP du drive|Drive RSRP/ }).first();
  if (!(await button.isVisible().catch(() => false))) return null;
  if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
  const fieldset = page.locator("fieldset", { hasText: /Liens point|Point.*cell links/ }).first();
  await fieldset.waitFor({ state: "visible", timeout: 10_000 });
  return fieldset.locator("label").evaluateAll((labels) =>
    labels.slice(0, 3).map((label) => ({
      text: label.textContent?.replace(/\s+/g, " ").trim() ?? "",
      checked: label.querySelector("input")?.checked ?? null,
    })),
  );
}

async function readKpiLinkToggles(page) {
  const button = page.getByRole("button", { name: /Réglages.*carte|Metric map settings/i }).first();
  await button.click();
  const settings = page.getByTestId("metric-map-settings").first();
  await settings.waitFor({ state: "visible", timeout: 10_000 });
  return settings.locator("fieldset label").evaluateAll((labels) =>
    labels.slice(0, 3).map((label) => ({
      text: label.textContent?.replace(/\s+/g, " ").trim() ?? "",
      checked: label.querySelector("input")?.checked ?? null,
    })),
  );
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
const responses = [];
page.on("response", async (response) => {
  const url = response.url();
  if (!/\/metrics\/(?:map|table)\?/.test(url)) return;
  try {
    responses.push(summarizeMetricPayload(url, response.status(), await response.json()));
  } catch (error) {
    responses.push({ url, status: response.status(), parseError: String(error) });
  }
});

await page.goto(`${base}/login`, { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.getByLabel(/Adresse e-mail|Email address/).fill(email);
await page.getByLabel(/Mot de passe|Password/, { exact: true }).fill(password);
await page.getByRole("button", { name: /Se connecter|Sign in/, exact: true }).click();
// The app keeps long-lived tile/font requests open, so waiting for the page
// `load` event can time out after a successful SPA navigation.  The pathname
// is the authentication fact needed by this read-only audit.
await page.waitForFunction(() => window.location.pathname !== "/login", undefined, {
  timeout: 30_000,
});
await page.evaluate(
  ({ projectId: pid, email: user }) => {
    localStorage.setItem(
      `bc4.activeProject.v1.${user}`,
      JSON.stringify({ id: pid, name: "Test_6" }),
    );
  },
  { projectId, email },
);

const report = { base, projectId, captures: {}, generatedAt: new Date().toISOString() };
for (const captureId of captures) {
  report.captures[captureId] = {};
  for (const view of views) {
    responses.length = 0;
    await page.evaluate(
      ({ projectId: pid, captureId: cid }) => {
        localStorage.setItem(`bc4.activeCapture.${pid}`, cid);
        sessionStorage.setItem(`bc4.capture.v2.${pid}`, cid);
      },
      { projectId, captureId },
    );
    if (view === "map") {
      await page.goto(`${base}/map?capture_id=${captureId}`, {
        waitUntil: "domcontentloaded",
        timeout: 120_000,
      });
      await page.getByTestId("network-map-chrome").waitFor({ state: "visible", timeout: 120_000 });
    } else if (view === "signaling") {
      await page.goto(`${base}/signaling?capture_id=${captureId}`, {
        waitUntil: "domcontentloaded",
        timeout: 120_000,
      });
      await page.getByTestId("network-map-chrome").waitFor({ state: "visible", timeout: 120_000 });
    } else {
      await page.goto(`${base}/kpi?capture_id=${captureId}`, {
        waitUntil: "domcontentloaded",
        timeout: 120_000,
      });
      const metricsTab = page.getByRole("tab", { name: /^Metrics/ });
      await metricsTab.waitFor({ state: "visible", timeout: 120_000 });
      await metricsTab.click();
      const search = page
        .getByRole("textbox", { name: /Search metrics|Rechercher.*métr/i })
        .first();
      await search.fill("RSRP");
      const tree = page.getByTestId("unified-metrics-tree");
      const leafButton = tree
        .locator(".kpi-tree-leaf button[aria-pressed]:not([disabled])")
        .filter({ hasText: /RSRP.*Serving/i })
        .first();
      await leafButton.waitFor({ state: "visible", timeout: 120_000 });
      if ((await leafButton.getAttribute("aria-pressed")) !== "true") await leafButton.click();
      const leaf = leafButton.locator("xpath=ancestor::*[contains(@class,'kpi-tree-leaf')][1]");
      await leaf.locator("button.kpi-leaf-menu").click();
      await page.getByRole("menuitem", { name: /^(Map|Carte)$/ }).click();
      await page.locator("[data-view='map'][data-metric-code*='cell_rsrp']").first().waitFor({
        state: "visible",
        timeout: 120_000,
      });
      await page.waitForFunction(
        () =>
          Number(
            document.querySelector("[data-view='map'][data-metric-code*='cell_rsrp']")?.dataset
              ?.pointCount ?? 0,
          ) > 0,
        undefined,
        { timeout: 120_000 },
      );
    }
    if (view !== "kpi") {
      await page
        .getByText(/Loading drive points|Chargement.*points/i)
        .waitFor({ state: "hidden", timeout: 45_000 })
        .catch(() => {});
    }
    await page.waitForTimeout(5_000);
    const beforeClick = await inspectMap(page);
    const toggles =
      view === "kpi" ? await readKpiLinkToggles(page) : await readDriveLinkToggles(page);
    const beforeClickScreenshot = `${out}${captureId}-${view}-before-click.png`;
    await page.screenshot({ path: beforeClickScreenshot, fullPage: true });
    const target = beforeClick.flatMap((map) => (map.clickTarget ? [map.clickTarget] : []))[0];
    if (target) {
      await page.mouse.click(target.x, target.y);
      await page.waitForTimeout(750);
    }
    const afterClick = await inspectMap(page);
    const afterClickScreenshot = `${out}${captureId}-${view}-after-click.png`;
    await page.screenshot({ path: afterClickScreenshot, fullPage: true });
    report.captures[captureId][view] = {
      metricResponses: [...responses],
      toggles,
      beforeClick,
      clickedMeasurementPoint: Boolean(target),
      afterClick,
      beforeClickScreenshot,
      afterClickScreenshot,
    };
  }
}

await writeFile(`${out}report.json`, `${JSON.stringify(report, null, 2)}\n`);
await browser.close();
console.log(JSON.stringify(report, null, 2));
