import { MetricSchema, MetricSeriesSchema, EventsSchema } from "../src/lib/api/metrics-schemas";
// `bun run contract:check` — vérifie que la réponse live du back aligne
// avec les schémas Zod des routes KPI (bc4-back 0.40.0+).
//
// Pourquoi un live-check et pas une diff OpenAPI pure :
// `/openapi.json` du back ne décrit **pas** la forme des 3 routes
// `/projects/{project_id}/kpi/{catalog,filters,{code}}` — leurs handlers
// FastAPI sont déclarés sans `response_model`, donc OpenAPI ne connaît
// que leur méthode + path. On vérifie donc deux choses complémentaires :
//
//   1. Les 3 routes sont bien **déclarées** dans `/openapi.json`
//      (GET + path exact). Si une route disparaît, on sait pourquoi.
//   2. Les **réponses live** parsent via nos schémas Zod. Un diff
//      lisible est affiché à l'écran (chemin + attendu + reçu) en cas
//      d'échec. Pas de CI : à lancer à la main avant chaque lot
//      impactant le contrat.
//
// Usage :
//   BC4_API_BASE=http://localhost:8000 \
//   BC4_ADMIN_EMAIL=admin@bc4.local \
//   BC4_ADMIN_PASSWORD=ChangeMeAdmin123! \
//   BC4_PROJECT_ID=7e656b8c6c19 \
//     bun run contract:check
//
// Exit codes :
//   0 — PASS (routes présentes + schémas Zod OK)
//   1 — FAIL (route manquante dans OpenAPI, ou safeParse Zod échoue)
//   2 — Infrastructure (login impossible, back injoignable…)

import {
  ProjectKpiCatalogSchema,
  ProjectKpiDetailSchema,
  ProjectKpiFiltersSchema,
} from "../src/lib/api/project-kpi-schemas";

const BASE = (process.env["BC4_API_BASE"] ?? "http://localhost:8000").replace(/\/+$/, "");
const EMAIL = process.env["BC4_ADMIN_EMAIL"] ?? "admin@bc4.local";
const PASSWORD = process.env["BC4_ADMIN_PASSWORD"] ?? "ChangeMeAdmin123!";
const PROJECT_ID = process.env["BC4_PROJECT_ID"] ?? "7e656b8c6c19"; // REF_PETITE_FORET

type Ok = { ok: true; label: string; detail?: string | undefined };
type Fail = { ok: false; label: string; detail: string };
type Result = Ok | Fail;

const results: Result[] = [];

function reportStart(label: string) {
  console.log(`→ ${label}`);
}
function pass(label: string, detail?: string) {
  results.push({ ok: true, label, detail });
  console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ""}`);
}
function fail(label: string, detail: string) {
  results.push({ ok: false, label, detail });
  console.log(
    `  ✗ ${label}\n${detail
      .split("\n")
      .map((l) => `    ${l}`)
      .join("\n")}`,
  );
}

async function login(): Promise<string> {
  const r = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!r.ok) throw new Error(`login HTTP ${r.status}`);
  const d = (await r.json()) as { token?: string };
  if (!d.token) throw new Error("login: no token in response");
  return d.token;
}

async function getJson(path: string, token?: string): Promise<unknown> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(`${BASE}${path}`, { headers });
  if (!r.ok) throw new Error(`GET ${path} HTTP ${r.status}`);
  return r.json();
}

async function main(): Promise<number> {
  console.log(`contract:check — back ${BASE} — project ${PROJECT_ID}`);
  console.log("");

  // 1. /openapi.json — déclare bien les 3 routes GET ?
  reportStart("OpenAPI declares /projects/{project_id}/kpi/*");
  let openapi: Record<string, unknown> & {
    info?: { version?: string };
    paths?: Record<string, Record<string, unknown>>;
  };
  try {
    openapi = (await getJson("/openapi.json")) as typeof openapi;
  } catch (e) {
    fail("fetch /openapi.json", (e as Error).message);
    return summarize();
  }
  const backVersion = openapi.info?.version ?? "N/D";
  pass(`back OpenAPI info.version = ${backVersion}`);
  const paths = openapi.paths ?? {};
  const expected = [
    "/projects/{project_id}/metrics",
    "/projects/{project_id}/metrics/series",
    "/projects/{project_id}/metrics/captures",
    "/projects/{project_id}/captures/{capture_id}/events",
    "/projects/{project_id}/kpi/catalog",
    "/projects/{project_id}/kpi/filters",
    "/projects/{project_id}/kpi/{code}",
  ];
  for (const p of expected) {
    const spec = paths[p];
    if (!spec || !("get" in spec)) {
      fail(`route declared: GET ${p}`, "not found in /openapi.json");
    } else {
      pass(`route declared: GET ${p}`);
    }
  }
  console.log("");

  // 2. Login (needed for the project-scoped routes).
  reportStart("Auth bearer");
  let token: string;
  try {
    token = await login();
    pass("login", `as ${EMAIL}`);
  } catch (e) {
    fail("login", (e as Error).message);
    return summarize();
  }
  console.log("");

  // 3. /projects/{id}/kpi/catalog — safeParse.
  reportStart(`GET /projects/${PROJECT_ID}/kpi/catalog`);
  try {
    const raw = await getJson(`/projects/${encodeURIComponent(PROJECT_ID)}/kpi/catalog`, token);
    const parsed = ProjectKpiCatalogSchema.safeParse(raw);
    if (parsed.success) {
      const nTechno = parsed.data.tree.length;
      const nTotal = parsed.data.tree.reduce(
        (acc, t) => acc + t.families.reduce((a, f) => a + f.kpis.length, 0),
        0,
      );
      pass(
        `catalog v${parsed.data.catalog_version}`,
        `${nTechno} technos · ${nTotal} KPI · counts_by_techno keys = ${
          Object.keys(parsed.data.counts_by_techno ?? {}).join(", ") || "N/D"
        }`,
      );
    } else {
      const msgs = parsed.error.issues
        .slice(0, 10)
        .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`);
      fail("ProjectKpiCatalogSchema.safeParse", msgs.join("\n"));
    }
  } catch (e) {
    fail("ProjectKpiCatalogSchema fetch", (e as Error).message);
  }
  console.log("");

  // 4. /projects/{id}/kpi/filters — safeParse.
  reportStart(`GET /projects/${PROJECT_ID}/kpi/filters`);
  try {
    const raw = await getJson(`/projects/${encodeURIComponent(PROJECT_ID)}/kpi/filters`, token);
    const parsed = ProjectKpiFiltersSchema.safeParse(raw);
    if (parsed.success) {
      pass(
        "filters schema OK",
        `operators=${parsed.data.operators.values.length} rats=${parsed.data.rats.values.length} bands=${parsed.data.bands.values.length} services=${parsed.data.service_types.values.length}`,
      );
    } else {
      const msgs = parsed.error.issues
        .slice(0, 10)
        .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`);
      fail("ProjectKpiFiltersSchema.safeParse", msgs.join("\n"));
    }
  } catch (e) {
    fail("ProjectKpiFiltersSchema fetch", (e as Error).message);
  }
  console.log("");

  // 5. /projects/{id}/kpi/{first-available-code} — safeParse.
  reportStart(`GET /projects/${PROJECT_ID}/kpi/{code}`);
  try {
    const raw = (await getJson(
      `/projects/${encodeURIComponent(PROJECT_ID)}/kpi/catalog`,
      token,
    )) as {
      tree?: Array<{
        families: Array<{ kpis: Array<{ code: string; status: string }> }>;
      }>;
    };
    const code = raw.tree
      ?.flatMap((t) => t.families.flatMap((f) => f.kpis))
      .find((k) => k.status === "AVAILABLE")?.code;
    if (!code) {
      pass("no AVAILABLE KPI to probe", "catalog contains no AVAILABLE kpi");
    } else {
      const detail = await getJson(
        `/projects/${encodeURIComponent(PROJECT_ID)}/kpi/${encodeURIComponent(code)}`,
        token,
      );
      const parsed = ProjectKpiDetailSchema.safeParse(detail);
      if (parsed.success) {
        pass(
          `detail ${code} schema OK`,
          `status=${parsed.data.status} n=${parsed.data.n ?? "N/D"}`,
        );
      } else {
        const msgs = parsed.error.issues
          .slice(0, 10)
          .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`);
        fail(`ProjectKpiDetailSchema.safeParse (${code})`, msgs.join("\n"));
      }
    }
  } catch (e) {
    fail("ProjectKpiDetailSchema fetch", (e as Error).message);
  }
  console.log("");

  try {
    const metricCatalog = MetricSchema.array().parse(
      await getJson(`/projects/${PROJECT_ID}/metrics`, token),
    );
    pass("metrics catalogue schema OK");
    const captures = (await getJson(`/projects/${PROJECT_ID}/metrics/captures`, token)) as {
      capture_id: string;
    }[];
    if (captures[0] && metricCatalog[0]) {
      const cap = captures[0].capture_id;
      const series = MetricSeriesSchema.parse(
        await getJson(
          `/projects/${PROJECT_ID}/metrics/series?capture_id=${cap}&codes=${metricCatalog[0].code}`,
          token,
        ),
      );
      if (series.capture_id !== cap) throw new Error("capture scope mismatch");
      EventsSchema.parse(await getJson(`/projects/${PROJECT_ID}/captures/${cap}/events`, token));
      pass("capture series + events schemas OK");
    }
  } catch (e) {
    fail("chronogram contract", (e as Error).message);
  }

  return summarize();
}

function summarize(): number {
  const fails = results.filter((r) => !r.ok);
  const passes = results.filter((r) => r.ok);
  console.log(`SUMMARY — pass=${passes.length} fail=${fails.length}`);
  if (fails.length > 0) {
    console.log("\nFAILS:");
    for (const f of fails) {
      console.log(`  - ${f.label}`);
      for (const line of f.detail.split("\n")) {
        console.log(`      ${line}`);
      }
    }
    return 1;
  }
  console.log("\nAll contracts match — PASS");
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error("contract:check infrastructure error:", e);
    process.exit(2);
  });
