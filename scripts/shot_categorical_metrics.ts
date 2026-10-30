import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const front = process.env["BC1_FRONT_BASE"] ?? "http://127.0.0.1:5176";
const token = process.env["BC1_TOKEN"];
if (!token) throw new Error("BC1_TOKEN is required");

const projectId = "43e81a34a073";
const captureId = "a4b0c321c52e";
const examples = ["rachi_rach_result", "hoa_hoa_type", "cell_pci@lte-type-2"];
const outDir = "audit/bc1-kpi-categorical-metrics";
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
for (const code of examples) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript(
    ([jwt, metric]) => {
      const user = {
        id: "adm-be45f070eba8",
        email: "admin@bc4.local",
        role: "admin",
        active: true,
        created_at: "2026-10-30T00:00:00Z",
      };
      localStorage.setItem(
        "bc4.session",
        JSON.stringify({
          token: jwt,
          token_type: "Bearer",
          expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
          user,
        }),
      );
      localStorage.setItem(
        `bc4.activeProject.v1.${user.email}`,
        JSON.stringify({ id: "43e81a34a073", name: "Test_6" }),
      );
      localStorage.setItem(
        "bc4.kpi.tabs.43e81a34a073",
        btoa(
          JSON.stringify({
            t: [{ i: "categorical-proof", n: "Categorical proof", c: [], m: [metric], a: null, l: "1", o: 0 }],
            a: "categorical-proof",
          }),
        ),
      );
      localStorage.setItem("bc3.metrics.views.categorical-proof", JSON.stringify({ [metric]: "graph" }));
      sessionStorage.setItem("bc4.capture.v2.43e81a34a073", "a4b0c321c52e");
    },
    [token, code] as const,
  );
  await page.goto(`${front}/kpi`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.locator(`[data-metric-code="${code}"]`).waitFor({ timeout: 60_000 });
  await page.locator('[data-testid="metric-categorical-plot"]').waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1_500);
  const safe = code.replace(/[^a-z0-9_-]+/gi, "_");
  await page.screenshot({ path: `${outDir}/${safe}.png`, fullPage: true });
  await context.close();
}
await browser.close();
