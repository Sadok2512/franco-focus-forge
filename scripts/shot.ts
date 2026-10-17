// bun run shot -- /kpi [projectRef] [--empty-filters]
// Capture PNG headless + compte des chips de la barre /kpi + liste des
// erreurs console. Un rapport UI sans PNG N'EST PAS une livraison.
//
// Options :
//   /kpi             — route (requise)
//   REF              — ref projet (défaut REF_PETITE_FORET) ; résolue via GET /projects
//   --empty-filters  — intercepte /kpi/filters et retourne `{}` (test fallback)
//   --out=path       — chemin de sortie (défaut artifacts/kpi-REF-<ts>.png)
//
// Comportement :
//   - loggin admin par défaut (BC4_ADMIN_*),
//   - headless true, viewport 1440x900,
//   - timeout 30s,
//   - console.error/warning agrégés en JSON à côté du PNG,
//   - compte chips actifs/grisés/forme? détecté via DOM (data-chip-state).

import { chromium, type ConsoleMessage } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const FRONT = process.env["BC4_FRONT_BASE"] ?? "http://localhost:5173";
const API = process.env["BC4_API_BASE"] ?? "http://localhost:8000";
const EMAIL = process.env["BC4_ADMIN_EMAIL"] ?? "admin@bc4.local";
const PASSWORD = process.env["BC4_ADMIN_PASSWORD"] ?? "ChangeMeAdmin123!";

const argv = process.argv.slice(2).filter(a => a !== "--");
const route = argv.find(a => a.startsWith("/")) ?? "/kpi";
const emptyFilters = argv.includes("--empty-filters");
const outArg = argv.find(a => a.startsWith("--out="))?.slice(6);
const refArg = argv.find(a => !a.startsWith("-") && !a.startsWith("/"));

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

async function resolveProjectId(token: string, ref: string | undefined): Promise<string> {
  const r = await fetch(`${API}/projects`, { headers: { Authorization: `Bearer ${token}` } });
  const list = await r.json() as Array<{ id: string; ref?: string | null; name?: string }>;
  if (!ref) {
    const petite = list.find(p => (p.name ?? "").includes("PETITE_FORET"));
    if (!petite) throw new Error("REF_PETITE_FORET not found");
    return petite.id;
  }
  const hit = list.find(p => p.id === ref || p.ref === ref || p.name === ref);
  if (!hit) throw new Error(`project not found: ${ref}`);
  return hit.id;
}

async function main() {
  const token = await login();
  const projectId = await resolveProjectId(token, refArg);
  const outPath = outArg ?? `artifacts/shot-${route.replace(/\//g, "_")}-${projectId.slice(0, 8)}${emptyFilters ? "-empty" : ""}-${Date.now()}.png`;
  await mkdir(dirname(outPath), { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const consoleEntries: Array<{ type: string; text: string }> = [];
  page.on("console", (m: ConsoleMessage) => {
    consoleEntries.push({ type: m.type(), text: m.text() });
  });
  page.on("pageerror", (e) => {
    consoleEntries.push({ type: "pageerror", text: e.message });
  });

  // Injecte le token dans localStorage avant chargement de l'app.
  // Clé session : `bc4.session`. Clé activeProject : `bc4.activeProject.v1.<scope>`
  // où `scope = s.user` → interpolé en template literal → `[object Object]`
  // (le front n'extrait pas .email). On reproduit la clé effective.
  await page.addInitScript(([tok, pid]) => {
    try {
      const sess = { token: tok, token_type: "Bearer", expires_at: new Date(Date.now()+3600_000).toISOString(), user: { id: "adm-30bf55313911", email: "admin@bc4.local", role: "admin", active: true, created_at: "2026-10-15T14:22:08Z" } };
      window.localStorage.setItem("bc4.session", JSON.stringify(sess));
      // activeProject.ts importe getSession depuis ./auth (shim) qui
      // renvoie `{ user: email, ... }` — donc scope = email.
      window.localStorage.setItem(
        `bc4.activeProject.v1.${sess.user.email}`,
        JSON.stringify({ id: pid, name: "REF_PETITE_FORET" }),
      );
    } catch (_e) { /* ignore */ }
  }, [token, projectId] as const);

  if (emptyFilters) {
    await page.route(`**/projects/${projectId}/kpi/filters`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "{}",
      });
    });
  }

  const url = `${FRONT}${route}`;
  await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
  // Laisse le temps aux requêtes KPI et aux states loadés de rendre la barre.
  await page.waitForTimeout(1500);

  // Compte les chips : on utilise des sélecteurs textuels sur les labels
  // attendus (constante EXPECTED_FILTER_DIMS). Un chip "actif" est un
  // bouton MultiSelect (role=button + aria-haspopup=listbox) ; les autres
  // sont des <span> grisés (classe border-dashed) ou "forme?" (texte).
  const debug = await page.evaluate(() => {
    return {
      url: location.href,
      title: document.title,
      bodyText: (document.body.textContent ?? "").slice(0, 400),
      panelCount: document.querySelectorAll("div.panel").length,
      hasFiltres: !!document.body.textContent?.includes("Filtres"),
    };
  });
  console.error("DEBUG", JSON.stringify(debug, null, 2));

  const counts = await page.evaluate(() => {
    const panels = Array.from(document.querySelectorAll("div.panel"));
    const bar = panels.find(p => p.textContent?.includes("Filtres"));
    if (!bar) return { bar: false, active: 0, gray: 0, malformed: 0, error: false };
    const buttons = bar.querySelectorAll("button[aria-haspopup=listbox]");
    // Les chips malformed / gray sont des <span> DIRECTS enfants de la
    // barre (profondeur 1). Les <span> internes (opacity, icônes) ne
    // comptent pas — on filtre par parent === bar.
    const directSpans = Array.from(bar.querySelectorAll(":scope > span"));
    const malformed = directSpans.filter(s => (s.textContent ?? "").includes("forme?")).length;
    const errorBanner = directSpans.find(s => (s.textContent ?? "").includes("Filtres indisponibles"));
    const grayDashed = directSpans.filter(s => {
      const cls = s.className ?? "";
      return cls.includes("border-dashed") && !(s.textContent ?? "").includes("forme?") && !(s.textContent ?? "").includes("Filtres indisponibles");
    }).length;
    return {
      bar: true,
      active: buttons.length,
      gray: grayDashed,
      malformed,
      error: !!errorBanner,
    };
  });

  // Capture + extraction du footer version (sidebar KPI).
  const footer = await page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll("span"));
    const front = spans.find(s => (s.textContent ?? "").match(/^front v/))?.textContent ?? "";
    const back = spans.find(s => (s.textContent ?? "").match(/^back v/))?.textContent ?? "";
    return { front, back };
  });

  await page.screenshot({ path: outPath, fullPage: true });
  await browser.close();

  const errors = consoleEntries.filter(e => e.type === "error" || e.type === "pageerror");
  const warnings = consoleEntries.filter(e => e.type === "warning");

  const report = {
    url, projectId, route, emptyFilters,
    counts, footer,
    consoleErrors: errors, consoleWarnings: warnings,
    png: outPath,
  };
  await writeFile(outPath.replace(/\.png$/, ".json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch(e => { console.error(e); process.exit(2); });
