// bun run shot-flow -- /projects REF_PETITE_FORET
// Reproduit le PARCOURS UTILISATEUR réel :
//  1. /login UI (ou session injectée en localStorage), bascule sur /projects
//  2. Click "Ouvrir" sur le projet nommé
//  3. Click "KPI Analytics" dans la nav
//  4. Capture TOUTES les requêtes /kpi/filters (URL, statut, body, timing)
//  5. PNG + JSON log
//
// Comparaison avec shot.ts : shot.ts injecte directement `activeProject` et
// visite /kpi — court-circuite TOUT le store/timing React. shot_flow.ts
// reproduit l'ordre « click Ouvrir → navigate → mount KPI », qui est ce
// que l'utilisateur voit.

import { chromium, type ConsoleMessage, type Request, type Response } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const FRONT = process.env["BC4_FRONT_BASE"] ?? "http://localhost:5173";
const API = process.env["BC4_API_BASE"] ?? "http://localhost:8000";
const EMAIL = process.env["BC4_ADMIN_EMAIL"] ?? "admin@bc4.local";
const PASSWORD = process.env["BC4_ADMIN_PASSWORD"] ?? "ChangeMeAdmin123!";

const argv = process.argv.slice(2).filter(a => a !== "--");
const projectName = argv.find(a => !a.startsWith("-") && !a.startsWith("/")) ?? "REF_PETITE_FORET";
const outArg = argv.find(a => a.startsWith("--out="))?.slice(6);

async function login(): Promise<string> {
  const r = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const d = (await r.json()) as { token?: string };
  if (!d.token) throw new Error("no token");
  return d.token;
}

async function main() {
  const token = await login();
  const outPath = outArg ?? `artifacts/shot-flow-${projectName}-${Date.now()}.png`;
  await mkdir(dirname(outPath), { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // Journal réseau — on garde TOUTES les requêtes vers /kpi/* et /projects
  // avec URL exacte, statut, timing relatif.
  type NetHit = {
    url: string; method: string; status: number | null;
    reqAt: number; resAt: number | null;
    reqBody?: string | undefined;
    headers?: Record<string, string> | undefined;
    pageUrl: string;
  };
  const t0 = Date.now();
  const net: NetHit[] = [];
  page.on("request", (req: Request) => {
    const u = req.url();
    if (!/\/kpi\/|\/projects/.test(u)) return;
    net.push({
      url: u, method: req.method(), status: null,
      reqAt: Date.now() - t0, resAt: null,
      reqBody: req.postData() ?? undefined,
      headers: Object.fromEntries(Object.entries(req.headers()).filter(([k]) => /^(authorization|accept|content-type|referer|x-)/i.test(k))),
      pageUrl: page.url(),
    });
  });
  page.on("response", async (res: Response) => {
    const u = res.url();
    if (!/\/kpi\/|\/projects/.test(u)) return;
    const hit = net.find(h => h.url === u && h.resAt === null);
    if (hit) {
      hit.status = res.status();
      hit.resAt = Date.now() - t0;
    }
  });

  const consoleEntries: Array<{ type: string; text: string }> = [];
  page.on("console", (m: ConsoleMessage) => consoleEntries.push({ type: m.type(), text: m.text() }));
  page.on("pageerror", (e) => consoleEntries.push({ type: "pageerror", text: e.message }));

  // Injecte uniquement la session (pas d'activeProject) — on le pose via UI.
  await page.addInitScript((tok) => {
    try {
      const sess = { token: tok, token_type: "Bearer", expires_at: new Date(Date.now()+3600_000).toISOString(), user: { id: "adm-30bf55313911", email: "admin@bc4.local", role: "admin", active: true, created_at: "2026-10-15T14:22:08Z" } };
      window.localStorage.setItem("bc4.session", JSON.stringify(sess));
    } catch {/* ignore */}
  }, token);

  // 1. /projects
  await page.goto(`${FRONT}/projects`, { waitUntil: "networkidle", timeout: 30_000 });
  await page.waitForTimeout(500);

  // 2. Click « Ouvrir » sur la ligne qui porte `projectName`.
  // Chaque ligne a un bouton <button>...<FolderOpen/> Ouvrir</button>. On
  // cible la row par le texte du nom projet, puis le bouton Ouvrir dans
  // la MÊME row.
  const projectRow = page.locator("tr", { hasText: projectName }).first();
  const projectRowExists = await projectRow.count();
  if (projectRowExists === 0) {
    throw new Error(`Project row with text "${projectName}" not found on /projects`);
  }
  const openBtn = projectRow.locator("button", { hasText: "Ouvrir" }).first();
  await openBtn.click({ timeout: 5000 });
  await page.waitForTimeout(300);  // laisse le store se poser

  // 3. Click « KPI Analytics » dans la nav
  const kpiNav = page.locator("nav a", { hasText: "KPI Analytics" }).first();
  await kpiNav.click({ timeout: 5000 });
  // Attend jusqu'à voir le mot "Filtres" dans la panel (barre rendue) OU
  // "Sélectionne un projet" (NoActiveProject) OU timeout 60s.
  try {
    await page.waitForFunction(
      () => /Filtres|Sélectionne un projet|Catalogue/.test(document.body.textContent ?? ""),
      undefined, { timeout: 60_000 }
    );
  } catch { /* timeout — on continue pour capturer l'état figé */ }
  await page.waitForTimeout(1500);

  // DOM counts (barre filtres).
  const counts = await page.evaluate(() => {
    const panels = Array.from(document.querySelectorAll("div.panel"));
    const bar = panels.find(p => p.textContent?.includes("Filtres"));
    if (!bar) return { bar: false, active: 0, gray: 0, malformed: 0, error: false };
    const buttons = bar.querySelectorAll("button[aria-haspopup=listbox]");
    const directSpans = Array.from(bar.querySelectorAll(":scope > span"));
    const malformed = directSpans.filter(s => (s.textContent ?? "").includes("forme?")).length;
    const errorBanner = directSpans.find(s => (s.textContent ?? "").includes("Filtres indisponibles"));
    const grayDashed = directSpans.filter(s => {
      const cls = s.className ?? "";
      return cls.includes("border-dashed") && !(s.textContent ?? "").includes("forme?") && !(s.textContent ?? "").includes("Filtres indisponibles");
    }).length;
    return { bar: true, active: buttons.length, gray: grayDashed, malformed, error: !!errorBanner };
  });

  // Extraction des tooltips (`title`) pour TOUS les chips de la barre —
  // garde : chaque gris doit avoir une raison lisible, pas de muet.
  const chipTooltips = await page.evaluate(() => {
    const panels = Array.from(document.querySelectorAll("div.panel"));
    const bar = panels.find(p => p.textContent?.includes("Filtres"));
    if (!bar) return [];
    const chips: Array<{ label: string; kind: string; tooltip: string }> = [];
    // Boutons MultiSelect (chips actifs)
    bar.querySelectorAll("button[aria-haspopup=listbox]").forEach(b => {
      const label = (b.querySelector(":scope > span")?.textContent ?? "").trim();
      chips.push({ label, kind: "active", tooltip: b.getAttribute("title") ?? "" });
    });
    // Spans directs (chips gris + malformed + error-banner)
    Array.from(bar.querySelectorAll(":scope > span")).forEach(s => {
      const txt = (s.textContent ?? "").trim();
      const t = s.getAttribute("title") ?? "";
      const cls = s.className ?? "";
      let kind = "gray";
      if (txt.includes("·forme?")) kind = "malformed";
      else if (txt.includes("Filtres indisponibles")) kind = "error";
      else if (!cls.includes("border-dashed")) kind = "available-no-value";
      chips.push({ label: txt, kind, tooltip: t });
    });
    return chips;
  });

  const footer = await page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll("span"));
    return {
      front: spans.find(s => (s.textContent ?? "").match(/^front v/))?.textContent ?? "",
      back: spans.find(s => (s.textContent ?? "").match(/^back v/))?.textContent ?? "",
    };
  });

  await page.screenshot({ path: outPath, fullPage: true });
  await browser.close();

  const kpiFiltersCalls = net.filter(h => /\/kpi\/filters/.test(h.url));
  const errors = consoleEntries.filter(e => e.type === "error" || e.type === "pageerror");

  const report = {
    projectName, front: FRONT, api: API,
    counts, footer, chipTooltips,
    kpiFiltersCalls,
    allKpiCalls: net.filter(h => /\/kpi\//.test(h.url)),
    consoleErrors: errors,
    png: outPath,
  };
  await writeFile(outPath.replace(/\.png$/, ".json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch(e => { console.error(e); process.exit(2); });
