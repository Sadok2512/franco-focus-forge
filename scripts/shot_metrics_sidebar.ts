// bun run scripts/shot_metrics_sidebar.ts [projectId] [--out=path]
//
// Shot Phase 3b sidebar : /kpi → Metrics tab → expand LTE + NR → PNG.
// Capture le pied "Catalog 2.50.5 · Decoder 1.6.0" + l'arbre déplié avec
// les 4 niveaux Technology → Catégorie → Métrique (NFF event) → Feuilles.
//
// Prérequis : docker exec bc4-front-1 ... (API via http://api:8000).
//   BC4_API_BASE=http://api:8000 BC4_FRONT_BASE=http://localhost:5173 \
//     bun run scripts/shot_metrics_sidebar.ts 4b7bfd50ddb6
import { chromium, type ConsoleMessage } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const FRONT = process.env["BC4_FRONT_BASE"] ?? "http://localhost:5173";
const API = process.env["BC4_API_BASE"] ?? "http://localhost:8000";
const EMAIL = process.env["BC4_ADMIN_EMAIL"] ?? "admin@bc4.local";
const PASSWORD = process.env["BC4_ADMIN_PASSWORD"] ?? "ChangeMeAdmin123!";

const argv = process.argv.slice(2).filter(a => a !== "--");
const projectId = argv.find(a => !a.startsWith("-") && !a.startsWith("/")) ?? "4b7bfd50ddb6";
const outArg = argv.find(a => a.startsWith("--out="))?.slice(6);
const outPath = outArg ?? `artifacts/metrics-sidebar-${projectId.slice(0, 8)}-${Date.now()}.png`;

async function login(): Promise<string> {
  const r = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!r.ok) throw new Error(`login HTTP ${r.status}`);
  const d = (await r.json()) as { token?: string };
  if (!d.token) throw new Error("no token");
  return d.token;
}

async function main() {
  const token = await login();
  await mkdir(dirname(outPath), { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();

  const consoleEntries: Array<{ type: string; text: string }> = [];
  page.on("console", (m: ConsoleMessage) => consoleEntries.push({ type: m.type(), text: m.text() }));
  page.on("pageerror", (e) => consoleEntries.push({ type: "pageerror", text: e.message }));

  await page.addInitScript(([tok, pid, email]) => {
    try {
      const sess = {
        token: tok,
        token_type: "Bearer",
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
        user: { id: "adm-30bf55313911", email, role: "admin", active: true, created_at: "2026-10-15T14:22:08Z" },
      };
      window.localStorage.setItem("bc4.session", JSON.stringify(sess));
      window.localStorage.setItem(
        `bc4.activeProject.v1.${email}`,
        JSON.stringify({ id: pid, name: pid }),
      );
    } catch (_e) { /* ignore */ }
  }, [token, projectId, EMAIL] as const);

  await page.goto(`${FRONT}/kpi`, { waitUntil: "networkidle", timeout: 30000 });

  // Click "Metrics catalogue" tab (match EN or FR via aria-label contenant
  // "Metrics" ou "métriques"). Les tabs ont role="tab".
  await page.waitForSelector('[role="tab"]', { timeout: 10000 });
  const tabs = await page.$$('[role="tab"]');
  let clicked = false;
  for (const t of tabs) {
    const al = (await t.getAttribute("aria-label")) ?? "";
    if (/metrics|métriques|metriques/i.test(al)) {
      await t.click();
      clicked = true;
      break;
    }
  }
  if (!clicked) console.error("tab metrics NOT found; tabs=", await Promise.all(tabs.map(t => t.getAttribute("aria-label"))));
  // /metrics est lent au premier hit (build_catalog_v4 20s). Attendre que
  // le tree soit rendu (au moins 1 bouton kpi-tree-root présent).
  await page.waitForSelector("button.kpi-tree-root", { timeout: 60000 });
  await page.waitForTimeout(1000);

  // Expand "LTE" and "NR" technology roots (buttons with class kpi-tree-root)
  const roots = await page.$$("button.kpi-tree-root");
  console.log(`found ${roots.length} tech roots`);
  for (const root of roots) {
    const text = (await root.innerText()).trim();
    if (text === "LTE" || text === "NR") {
      const expanded = await root.getAttribute("aria-expanded");
      if (expanded !== "true") {
        await root.click();
        await page.waitForTimeout(400);
      }
    }
  }

  await page.waitForTimeout(500);
  await page.screenshot({ path: outPath, fullPage: false });

  await writeFile(outPath.replace(/\.png$/, ".console.json"),
    JSON.stringify({ consoleEntries, projectId, outPath }, null, 2));
  await browser.close();

  console.log(JSON.stringify({ png: outPath, consoleErrors: consoleEntries.filter(c => c.type === "error" || c.type === "pageerror").length }, null, 2));
}

void main();
