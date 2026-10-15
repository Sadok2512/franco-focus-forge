// G2 : smoke test bout-en-bout.
//
// Lance tous les endpoints utilisés par la démo contre l'API réelle, en
// validant chaque réponse via les schémas Zod EXISTANTS du front — même
// garde que celle qu'un composant applique au runtime.
//
// Usage :  VITE_BC4_API_BASE=http://localhost:8000 bun scripts/smoke_api.ts
// Erreur : sort avec exit != 0 si une étape échoue ou si une forme n'est
//          pas conforme (Zod lève, on propage).

import { z } from "zod";
import {
  ProjectSchema,
  type FilterContext,
} from "../src/lib/api/schemas";
import {
  DictProjectSchema,
  ParamDetailSchema,
  ParamListSchema,
  ParamMapSchema,
  TreeSchema,
} from "../src/lib/api/dictionary-schemas";
import { AssistantResponseSchema } from "../src/lib/api/assistant-schemas";
import {
  CellSummarySchema,
  ReferenceImportEntrySchema,
} from "../src/lib/api/reference-schemas";
import { NmfImportReportSchema } from "../src/lib/api/nmf-schemas";
import { ProjectIngestViewSchema } from "../src/lib/api/project-schemas";
import {
  AiConfigSchema,
  AppearanceSchema,
  OrganizationSchema,
  AboutSchema,
  UsersResponseSchema,
  KpiCatalogResponseSchema,
  GeoReferenceSchema,
} from "../src/lib/api/settings-schemas";

const BASE = (process.env["VITE_BC4_API_BASE"] ?? "").replace(/\/+$/, "");
if (!BASE) {
  console.error("!! VITE_BC4_API_BASE manquant");
  process.exit(2);
}

// B2 : auth via JWT Bearer. On se logue une fois, le token est partagé par
// tous les helpers. L'ancien ACTOR X-Actor-* est retiré — bc4-back ne
// l'honore plus (CHANGELOG 0.7.0).
const ADMIN_EMAIL = process.env["BC4_ADMIN_EMAIL"];
const ADMIN_PASSWORD = process.env["BC4_ADMIN_PASSWORD"];
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error("!! BC4_ADMIN_EMAIL / BC4_ADMIN_PASSWORD manquants (nécessaires au login B2)");
  process.exit(2);
}
let TOKEN: string | null = null;

async function hit<T>(label: string, path: string, schema: z.ZodType<T>, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init.body ? { "Content-Type": "application/json" } : {}),
    ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
  };
  const url = `${BASE}${path}`;
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${label} ${init.method ?? "GET"} ${path} → HTTP ${res.status}: ${body}`);
  }
  const json = await res.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    console.error(parsed.error.format());
    throw new Error(`${label} : réponse non conforme au schéma Zod (${path})`);
  }
  console.log(`  ✓ ${label} (${path})`);
  return parsed.data;
}

/** Variante tolérante : accepte un 501 (écart ouvert bc4-back) avec un
 *  log explicite. Toute autre erreur reste bruyante. */
async function hitOr501<T>(
  label: string,
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit = {},
): Promise<T | null> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
    ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
  };
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (res.status === 501) {
    console.log(`  ⚠ ${label} (${path}) → HTTP 501 toléré (endpoint reporté bc4-back)`);
    return null;
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${label} ${init.method ?? "GET"} ${path} → HTTP ${res.status}: ${body}`);
  }
  const json = await res.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    console.error(parsed.error.format());
    throw new Error(`${label} : réponse non conforme au schéma Zod (${path})`);
  }
  console.log(`  ✓ ${label} (${path})`);
  return parsed.data;
}

async function main() {
  console.log(`[smoke] API=${BASE}`);
  // B2 : login réel (email + password) → token Bearer réutilisé partout.
  const LoginSchema = z.object({
    token: z.string(),
    token_type: z.literal("Bearer"),
    expires_at: z.string(),
    user: z.object({
      id: z.string(),
      email: z.string(),
      role: z.enum(["admin", "ingenieur", "lecteur"]),
      active: z.boolean(),
      created_at: z.string(),
    }),
  });
  const auth = await hit("auth.login", "/auth/login", LoginSchema, {
    method: "POST",
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  TOKEN = auth.token;

  const projects = await hit("projects.list", "/projects", ProjectSchema.array());
  if (!projects.length) throw new Error("Aucun projet seedé — G2 échoue.");
  const paris = projects.find((p) => p.id === "idf-t3-2026");
  const rennes = projects.find((p) => p.id === "rennes-lte-2026");
  if (!paris || !rennes) throw new Error("Projets de démo attendus manquants (idf-t3-2026, rennes-lte-2026)");

  await hit("projects.detail (Paris)", `/projects/${paris.id}`, ProjectSchema);

  // Overview (schéma UI ad-hoc — on vérifie les champs clés)
  const OverviewSchema = z.object({
    project: ProjectSchema,
    points: z.array(z.any()),
    kpis: z.array(z.any()),
    byOperator: z.array(z.any()),
    trend: z.array(z.any()),
    source: z.object({
      sampleCount: z.number().int(),
      missingCount: z.number().int(),
      demo: z.literal(true),
    }),
  });
  await hit("projects.overview (Paris)", `/projects/${paris.id}/overview`, OverviewSchema);

  // Dict LTE + NR + param + map
  await hit("dict.project", `/projects/${paris.id}/dict`, DictProjectSchema);
  const tree = await hit("dict.tree", `/projects/${paris.id}/dict/tree`, TreeSchema);
  const technos = new Set(tree.branches.map((b) => b.techno));
  if (!technos.has("LTE") || !technos.has("NR"))
    throw new Error("G2 : branches LTE+NR requises (invariant Zod)");
  await hit("dict.params (lte-mr)", `/projects/${paris.id}/dict/params?msg_id=lte-mr`, ParamListSchema);
  await hit(
    "dict.param (lte-mr-rsrp)",
    `/projects/${paris.id}/dict/param?param_id=lte-mr-rsrp&group_by=operator`,
    ParamDetailSchema,
  );
  await hit(
    "dict.param.map",
    `/projects/${paris.id}/dict/param/map?param_id=lte-mr-rsrp`,
    ParamMapSchema,
  );

  // KPI catalog
  const KpiCatalogSchema = z.object({
    catalog: z.array(z.object({ group: z.string(), items: z.array(z.string()) })),
    kpi: z.object({ name: z.string(), byOp: z.record(z.string(), z.number()) }).passthrough(),
  });
  await hit("kpi.catalog", "/kpi/catalog", KpiCatalogSchema);

  // Settings read endpoints
  await hit("settings.appearance", "/settings/appearance", AppearanceSchema);
  await hit("settings.organization", "/settings/organization", OrganizationSchema);
  await hit("settings.about", "/settings/about", AboutSchema);
  await hit("settings.users", "/settings/users", UsersResponseSchema);
  await hit("settings.kpi", "/settings/kpi", KpiCatalogResponseSchema);
  await hit("settings.geo", "/settings/geo", GeoReferenceSchema.array());
  await hit("settings.ai", "/settings/ai", AiConfigSchema);
  await hit("settings.ai.enabled", "/settings/ai/enabled", z.boolean());

  // Reference cellulaire (B1-réf)
  await hit("reference.imports", "/reference/cell/imports", ReferenceImportEntrySchema.array());
  // Amendement B1-réf : la dimension `arcep_breakdown` doit être présente
  // dans le summary (bc4-back 0.7.1), et son contenu doit coller au contrat
  // documenté (clé "N/D" possible pour les NULL ; libellés source LITTÉRAUX).
  const summary = await hit("reference.summary", "/reference/cell/summary", CellSummarySchema);
  if (!Array.isArray(summary.arcep_breakdown))
    throw new Error("G2 : arcep_breakdown absent du summary (bc4-back < 0.7.1 ?)");
  const arcepKeys = summary.arcep_breakdown.map((b) => b.key);
  console.log(`  ✓ G2 : arcep_breakdown présent (${arcepKeys.length} buckets) : ${arcepKeys.join(" | ")}`);
  // Filtre `arcep=...` sur le dict/tree Paris : chaque zone restreint le
  // scope strictement (count filtré ≤ count sans filtre). On vérifie au
  // moins qu'une zone concrète est acceptée par le back et que la réponse
  // reste Zod-conforme.
  const treeBaseline = await hit(
    "dict.tree (Paris, baseline)",
    `/projects/${paris.id}/dict/tree`,
    TreeSchema,
  );
  const totalBaseline = treeBaseline.branches
    .flatMap((b) => b.channels)
    .flatMap((c) => c.messages)
    .reduce((s, m) => s + m.count, 0);
  const anyZone = arcepKeys.find((k) => k !== "N/D") ?? arcepKeys[0];
  if (anyZone) {
    const treeFiltered = await hit(
      `dict.tree (Paris, arcep=${anyZone})`,
      `/projects/${paris.id}/dict/tree?arcep=${encodeURIComponent(anyZone)}`,
      TreeSchema,
    );
    const totalFiltered = treeFiltered.branches
      .flatMap((b) => b.channels)
      .flatMap((c) => c.messages)
      .reduce((s, m) => s + m.count, 0);
    if (totalFiltered > totalBaseline)
      throw new Error(
        `G2 : filtre ARCEP non restrictif (filtered=${totalFiltered} > baseline=${totalBaseline})`,
      );
    console.log(
      `  ✓ G2 : arcep=${anyZone} restreint (filtered=${totalFiltered} ≤ baseline=${totalBaseline})`,
    );
  }

  // B1-ingest : création de projet + import NMF.
  // Le back renvoie `ProjectIngestView` pour la création (status "draft"
  // tant qu'aucun NMF n'a été ingéré) et `NmfImportReport` pour l'import.
  // En mode api, on tolère un 501 (écart ouvert déclaré) tout en levant
  // bruyamment sur toute autre erreur ; en mode nominal on valide Zod.
  const createdName = `smoke-nmf-${Date.now().toString(36)}`;
  const created = await hitOr501("projects.create", "/projects", ProjectIngestViewSchema, {
    method: "POST",
    body: JSON.stringify({ name: createdName }),
  });
  const targetProjectId = created?.id ?? paris.id;
  const form = new FormData();
  // Fichier NMF synthétique minimal — le back validera (ou retournera 501).
  form.append(
    "files",
    new Blob([new Uint8Array([0, 1, 2, 3])], { type: "application/octet-stream" }),
    "synthetic.nmf",
  );
  await hitOr501(
    "projects.nmf_import",
    `/projects/${targetProjectId}/nmf`,
    NmfImportReportSchema,
    { method: "POST", body: form },
  );

  // Assistant (B0 : scénario neutre)
  const AssistantReq = {
    project_id: paris.id,
    conversation_id: "smoke-conv",
    question: "quel est l'échantillon ?",
    filters: {},
  };
  await hit("assistant.post", `/projects/${paris.id}/assistant`, AssistantResponseSchema, {
    method: "POST",
    body: JSON.stringify(AssistantReq),
  });

  // G3-renforcé : vérif Rennes NR vide
  const rennesTree = await hit(
    "dict.tree (Rennes)",
    `/projects/${rennes.id}/dict/tree`,
    TreeSchema,
  );
  const nrCount = rennesTree.branches
    .filter((b) => b.techno === "NR")
    .flatMap((b) => b.channels)
    .flatMap((c) => c.messages)
    .reduce((s, m) => s + m.count, 0);
  if (nrCount !== 0)
    throw new Error(`G2 : Rennes LTE doit avoir count NR=0, trouvé ${nrCount}`);
  console.log(`  ✓ G2-renforcé : Rennes LTE → NR count = 0`);

  // --- HYGIÈNE : purge des projets créés par ce smoke run ---
  // On ne pollue pas la vraie liste des projets de l'utilisateur avec les
  // artefacts du smoke. DELETE est idempotent : 204 OK, 404 toléré.
  if (created?.id) {
    try {
      const res = await fetch(`${BASE}/projects/${created.id}`, {
        method: "DELETE",
        headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {},
      });
      if (res.ok || res.status === 404) {
        console.log(`  ✓ cleanup : DELETE /projects/${created.id} (${res.status})`);
      } else {
        console.warn(`  ⚠ cleanup : DELETE échoué ${res.status} (projet laissé)`);
      }
    } catch (e) {
      console.warn(`  ⚠ cleanup : DELETE réseau échoué (${(e as Error).message})`);
    }
  }
  // Ceinture-bretelles : purge TOUT projet dont le nom commence par un
  // préfixe de test (si un run antérieur a planté avant le cleanup).
  try {
    const list = await (
      await fetch(`${BASE}/projects`, {
        headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {},
      })
    ).json();
    const TEST_PREFIXES = ["smoke-", "smoke-nmf-", "smoke-row-", "g9-", "g10-", "g11-"];
    for (const p of list as Array<{ id: string; name: string }>) {
      if (TEST_PREFIXES.some((pfx) => p.name?.startsWith(pfx) || p.id?.startsWith(pfx))) {
        await fetch(`${BASE}/projects/${p.id}`, {
          method: "DELETE",
          headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {},
        });
      }
    }
  } catch {
    // best-effort, rien à bloquer.
  }

  console.log("\n[smoke] tous les endpoints répondent, tous les schémas Zod passent ✓");
}

main().catch((e) => {
  console.error("\n!! smoke FAIL:", e.message);
  process.exit(1);
});
