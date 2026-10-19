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
page.on("pageerror", (e) => errors.push(e.stack || e.message));
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

const report = {};
try {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const response = await fetch(
    "http://localhost:8000/projects/134af70a06eb/dict/v2/tree?view=catalog",
    { headers: { Authorization: "Bearer " + session.token } },
  );
  const catalog = await response.json();
  const leaves = catalog.tree.flatMap((t) =>
    t.origins.flatMap((o) =>
      o.messages.flatMap((m) =>
        m.groups.flatMap((g) => g.kpis.map((k) => ({ ...k, techno: t.techno }))),
      ),
    ),
  );
  const unique = [...new Map(leaves.map((l) => [l.display_name, l])).values()].slice(0, 4);
  assert.equal(unique.length, 4);
  report.parameters = unique.map((l) => l.display_name);
  const probe = await fetch(
    "http://localhost:8000/projects/134af70a06eb/dict/param/map?" +
      new URLSearchParams({
        path: unique[0].sample_paths?.[0] ?? unique[0].param_key,
        system: unique[0].techno,
      }),
    { headers: { Authorization: "Bearer " + session.token } },
  );
  const mapPayload = await probe.json();
  report.mapContract = {
    status: probe.status,
    responseFields: Object.keys(mapPayload),
    pointCount: mapPayload.points?.length,
    pointFields: mapPayload.points?.[0] ? Object.keys(mapPayload.points[0]) : [],
  };
  await page.goto("http://localhost:5174/rrc", { waitUntil: "networkidle" });
  const map = page.getByRole("button", { name: "Carte", exact: true }),
    info = page.getByRole("button", { name: "Infos", exact: true });
  await map.waitFor();
  assert.equal(await map.getAttribute("aria-pressed"), "false");
  assert.equal(await info.getAttribute("aria-pressed"), "false");
  const analysis = page.getByTestId("dict-analysis-scroll");
  const wide = (await analysis.boundingBox()).width;
  await map.click();
  await page.getByRole("region", { name: "Carte des mesures RRC", exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("region", { name: "Informations des paramètres sélectionnés", exact: true })
      .count(),
    0,
  );
  await info.click();
  assert.equal(await page.getByTestId("rrc-right-panels").count(), 1);
  assert(Math.abs((await analysis.boundingBox()).width - wide) < 3);
  const mapBox = await page.locator(".rrc-map-panel").boundingBox();
  assert(Math.abs(mapBox.width - wide) < 5);
  assert(mapBox.height >= 350 && mapBox.height <= 452);
  await map.click();
  assert.equal(
    await page.getByRole("region", { name: "Carte des mesures RRC", exact: true }).count(),
    0,
  );
  await info.click();
  assert.equal(await page.getByTestId("rrc-right-panels").count(), 0);
  assert(Math.abs((await analysis.boundingBox()).width - wide) < 3);
  report.G1 = "PASS";
  report.G2 = "PASS";
  await map.click();
  await info.click();
  const add = async (leaf) => {
    await page.getByTestId("dict-tree-search").fill(leaf.display_name);
    await page
      .getByTestId("dict-leaf-" + leaf.display_name)
      .first()
      .locator('input[type="checkbox"]')
      .check();
  };
  for (const [index, leaf] of unique.slice(0, 3).entries()) {
    await add(leaf);
    await page.waitForTimeout(700);
    const grid = page.locator(".rrc-charts");
    await grid.locator(":scope > *").nth(index).waitFor();
    const bounds = await grid.evaluate((n) => ({
      width: n.getBoundingClientRect().width,
      children: [...n.children].map((c) => c.getBoundingClientRect().width),
    }));
    if (index === 0 || index === 2) assert(Math.abs(bounds.children[index] - bounds.width) < 3);
    if (index === 1) assert(Math.abs(bounds.children[0] - bounds.children[1]) < 3);
    report["chart" + (index + 1)] = bounds;
  }
  report.rootColors = await page
    .locator("[data-rrc-root]")
    .evaluateAll((ns) =>
      ns.map((n) => ({ tech: n.dataset.rrcRoot, color: getComputedStyle(n).color })),
    );
  assert(report.rootColors.some((n) => n.tech === "LTE" && n.color === "rgb(23, 105, 224)"));
  assert(report.rootColors.some((n) => n.tech === "NR" && n.color === "rgb(22, 163, 74)"));
  await page.getByTestId("dict-tree-search").fill("");
  assert.equal(await page.getByTestId("rrc-info-card").count(), 3);
  await page
    .getByRole("heading", { name: "Infos — Paramètres sélectionnés (3)", exact: true })
    .waitFor();
  await page
    .getByTestId("rrc-right-panels")
    .getByRole("button", { name: "Tout réduire", exact: true })
    .click();
  assert.equal(await page.locator('[data-testid="rrc-info-card"][open]').count(), 0);
  await add(unique[3]);
  assert.equal(await page.getByTestId("rrc-info-card").count(), 4);
  assert.equal(await page.locator('[data-testid="rrc-info-card"][open]').count(), 1);
  await page
    .getByTestId("dict-leaf-" + unique[3].display_name)
    .first()
    .locator('input[type="checkbox"]')
    .uncheck();
  assert.equal(await page.getByTestId("rrc-info-card").count(), 3);
  assert.equal(await page.locator('[data-testid="rrc-info-card"][open]').count(), 0);
  await page
    .getByTestId("rrc-right-panels")
    .getByRole("button", { name: "Tout développer", exact: true })
    .click();
  await page.getByTestId("dict-tree-search").fill("");
  await page
    .getByTestId("rrc-info-card")
    .first()
    .getByRole("button", { name: "Copier le chemin ASN.1", exact: true })
    .click();
  assert((await page.evaluate(() => navigator.clipboard.readText())).length > 0);
  await page
    .getByRole("textbox", { name: "Rechercher parmi les paramètres sélectionnés", exact: true })
    .fill(unique[0].display_name);
  assert.equal(await page.getByTestId("rrc-info-card").count(), 1);
  await page
    .getByRole("textbox", { name: "Rechercher parmi les paramètres sélectionnés", exact: true })
    .fill("");
  report.G6 = "PASS";
  report.G7 = "PASS";
  await page.waitForLoadState("networkidle");
  const mapCount = requests.length;
  await page.getByRole("button", { name: "Plein écran carte", exact: true }).click();
  await page.getByRole("button", { name: "Quitter le plein écran", exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Quitter le plein écran", exact: true })
    .waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Plein écran carte", exact: true }).click();
  await page.getByRole("button", { name: "Quitter le plein écran", exact: true }).click();
  assert.equal(requests.length, mapCount);
  report.G5 = "PASS (basemap fullscreen)";
  await page.locator(".maplibregl-canvas").waitFor();
  assert.equal(await page.locator(".maplibregl-marker").count(), 0);
  assert((await page.locator(".rrc-map-panel").innerText()).includes("Aucun point géolocalisé"));
  report.G9 = "PASS";
  const beforeDraft = requests.length;
  await page.getByRole("button", { name: /^Opérateur —/ }).click();
  await page.getByRole("checkbox", { name: "Orange", exact: true }).check();
  await page.keyboard.press("Escape");
  assert(
    (await page.locator(".rrc-map-panel .sr-only").innerText()).includes("Tous les opérateurs"),
  );
  await page.waitForTimeout(250);
  assert.equal(requests.length, beforeDraft);
  report.explicitApply = "PASS";
  await page.getByRole("button", { name: "Appliquer les filtres", exact: true }).click();
  await page.waitForTimeout(800);
  assert((await page.locator(".rrc-map-panel .sr-only").innerText()).includes("Orange"));
  assert.equal(await map.getAttribute("aria-pressed"), "true");
  assert.equal(await info.getAttribute("aria-pressed"), "true");
  report.appliedContext = "PASS";
  await page.waitForLoadState("networkidle");
  for (const card of await page.getByTestId("rrc-info-card").all())
    await card.getByRole("button", { name: "Voir plus", exact: true }).click();
  const values = await page
    .getByTestId("rrc-info-card")
    .evaluateAll((nodes) =>
      nodes.map((n) =>
        Object.fromEntries(
          [...n.querySelectorAll("dl > div")].map((d) => [
            d.querySelector("dt").textContent,
            d.querySelector("dd").textContent,
          ]),
        ),
      ),
    );
  const latest = new URL(requests.at(-1));
  const apiDistribution = await fetch(
    "http://localhost:8000" + latest.pathname.replace(/^\/api/, "") + latest.search,
    { headers: { Authorization: "Bearer " + session.token } },
  ).then((r) => r.json());
  for (const row of values) {
    const b = apiDistribution.blocks.find((b) => b.param_key === row["Clé canonique"]);
    assert(b);
    assert.equal(row.result_id, b.result_id);
    // Operator filters are applied by the established client distribution projection.
    const count = b.values
      .flatMap((v) => v.groups)
      .filter((g) => g.operator === "Orange")
      .reduce((sum, g) => sum + g.n, 0);
    assert.equal(Number(row["Occurrences (filtres appliqués)"]), count);
  }
  report.G8 = "PASS";
  await page
    .getByTestId("rrc-right-panels")
    .getByRole("button", { name: "Tout réduire", exact: true })
    .click();
  await page.getByTestId("rrc-info-card").first().locator("summary").click();
  await page.locator(".rrc-info-cards").evaluate((n) => (n.scrollTop = 0));
  const handle = await page.getByRole("separator").first().boundingBox();
  await page.mouse.move(handle.x, handle.y + 100);
  await page.mouse.down();
  await page.mouse.move(handle.x + 30, handle.y + 100);
  await page.mouse.up();
  for (const [width, height] of [
    [1920, 1080],
    [1440, 900],
    [1280, 800],
    [400, 900],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(250);
    assert(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
    report["size" + width] = await page.evaluate(() => ({
      height: innerHeight,
      document: document.documentElement.scrollHeight,
      overflowNodes: [...document.querySelectorAll("*")]
        .map((n) => ({
          tag: n.tagName,
          cls: typeof n.className === "string" ? n.className : "",
          bottom: n.getBoundingClientRect().bottom,
          position: getComputedStyle(n).position,
          overflow: getComputedStyle(n).overflow,
        }))
        .filter((n) => n.bottom > innerHeight + 30 && ["fixed", "absolute"].includes(n.position))
        .sort((a, b) => b.bottom - a.bottom)
        .slice(0, 6),
      root: [...document.body.children]
        .map((n) => ({
          tag: n.tagName,
          cls: n.className,
          height: n.getBoundingClientRect().height,
          bottom: n.getBoundingClientRect().bottom,
        }))
        .slice(0, 8),
    }));
    if (width >= 768)
      assert((await page.evaluate(() => document.documentElement.scrollHeight)) <= height + 2);
    const layout = await page.locator(".rrc-data-layout").evaluate((n) => ({
      columns: getComputedStyle(n).gridTemplateColumns,
      width: n.getBoundingClientRect().width,
    }));
    report["layout" + width] = layout;
    await page.screenshot({ path: out + "/" + width + ".png", fullPage: true });
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  await info.click();
  await page.getByTestId("dict-analysis-scroll").evaluate((n) => (n.scrollTop = 0));
  await page.waitForTimeout(500);
  await page.screenshot({ path: out + "/final.png" });
  await page.getByTestId("dict-analysis-scroll").evaluate((n) => (n.scrollTop = 500));
  await page.screenshot({ path: out + "/analysis.png" });
  await info.click();
  const scroll = page.locator(".rrc-info-cards");
  await scroll.evaluate((n) => (n.scrollTop = n.scrollHeight));
  const scrollProof = await scroll.evaluate((n) => ({
    top: n.scrollTop,
    height: n.clientHeight,
    total: n.scrollHeight,
  }));
  assert(Math.abs(scrollProof.total - scrollProof.height - scrollProof.top) < 3);
  report.scroll = scrollProof;
  report.G10 = "PASS";
  report.G11 = "PASS";
  assert.deepEqual(errors, []);
  report.consoleErrors = errors;
  report.result = "PASS";
} catch (e) {
  report.result = "FAIL";
  report.error = e.stack;
  await page.screenshot({ path: out + "/failure.png", fullPage: true });
  process.exitCode = 1;
} finally {
  fs.writeFileSync(out + "/browser.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
}
