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
  ParamListSchema,
  ParamMapSchema,
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

  // Dict LTE + NR + params + map — forme V2 unifiée (1.8.0).
  await hit("dict.project", `/projects/${paris.id}/dict`, DictProjectSchema);
  // Le back peut servir soit la V2 (`branches[].system`), soit la B0
  // (`branches[].techno/channels`) selon l'ingestion du projet. Le
  // schéma `TreeSchema` consommé par la UI est la forme unifiée V2 ;
  // on la vérifie ici après passage par l'adaptateur côté front
  // (`getDictTree`), pas en frappant /dict/tree brut.
  // Appel brut (shape possiblement B0 pour les seedés) : accepte les
  // deux shapes au niveau du smoke, la UI est protégée côté adaptateur.
  const rawTree = await (await fetch(`${BASE}/projects/${paris.id}/dict/tree`, {
    headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {},
  })).json();
  const technos = new Set(
    (rawTree?.branches ?? []).map((b: { techno?: string; system?: string }) => b.techno ?? b.system),
  );
  if (!technos.has("LTE") || !technos.has("NR"))
    throw new Error("G2 : branches LTE+NR requises (invariant Zod)");
  console.log(`  ✓ dict.tree (${paris.id}) — branches ${[...technos].join(" + ")}`);

  // (h.3) Filtres V2 : /dict/params?system=LTE&message=…&operator=…
  // doit être strictement restrictif ; /dict/param/map?path=…&system=…
  // doit renvoyer des points. On exerce ces trois cas sur TEST2 — projet
  // ingéré V2 (param_occurrence) côté back 0.14.0.
  const TEST2_ID = process.env["BC4_TEST2_PROJECT_ID"] ?? "134af70a06eb";
  const t2Raw = await (
    await fetch(`${BASE}/projects/${TEST2_ID}/dict/tree`, {
      headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {},
    })
  ).json();
  const t2V2 = Array.isArray(t2Raw?.branches) && t2Raw.branches.some((b: { system?: string }) => b.system);
  if (!t2V2) {
    console.log(`  ⚠ (h.3) ${TEST2_ID} non-V2 — smoke dégradé, skip filtres V2`);
  } else {
    // Vérifie le format V2.
    const V2 = z.object({
      branches: z.array(
        z.object({
          system: z.enum(["LTE", "NR"]),
          count: z.number().int(),
          messages: z.array(z.object({ message: z.string(), count: z.number().int() })),
        }),
      ),
    });
    const parsed = V2.safeParse(t2Raw);
    if (!parsed.success) throw new Error(`(h.3) /dict/tree V2 non conforme : ${parsed.error.message}`);
    const lteBranch = parsed.data.branches.find((b) => b.system === "LTE");
    const message = lteBranch?.messages.find((m) => m.message === "MeasurementReport")?.message
      ?? lteBranch?.messages[0]?.message;
    if (!message) {
      console.log(`  ⚠ (h.3) ${TEST2_ID} LTE sans message, skip filtres`);
    } else {
      // Baseline sans filtre.
      const base = await hit(
        `dict.params (TEST2 LTE ${message})`,
        `/projects/${TEST2_ID}/dict/params?system=LTE&message=${encodeURIComponent(message)}`,
        ParamListSchema,
      );
      // Filtre opérateur restrictif.
      const filtered = await hit(
        `dict.params (TEST2 LTE ${message} operator=Orange)`,
        `/projects/${TEST2_ID}/dict/params?system=LTE&message=${encodeURIComponent(message)}&operator=Orange`,
        ParamListSchema,
      );
      // Chaque param filtré doit avoir count ≤ count baseline sur le même path.
      for (const p of filtered.params) {
        const b = base.params.find((x) => x.path === p.path);
        if (b && p.count > b.count)
          throw new Error(`(h.3) filtre opérateur non restrictif sur ${p.path} (filtered=${p.count} > base=${b.count})`);
      }
      console.log(`  ✓ (h.3) filtre operator=Orange restrictif sur ${filtered.params.length} params`);
      // Map : path (si rsrpResult présent, on l'utilise, sinon premier path non-null).
      const probePath =
        base.params.find((p) => p.path.endsWith("rsrpResult"))?.path ??
        base.params[0]?.path;
      if (probePath) {
        const map = await hit(
          `dict.param.map (TEST2 LTE ${probePath.split("/").at(-1)})`,
          `/projects/${TEST2_ID}/dict/param/map?system=LTE&path=${encodeURIComponent(probePath)}`,
          ParamMapSchema,
        );
        console.log(`  ✓ (h.3) /dict/param/map renvoie ${map.points.length} points`);
      }

      // (h.4) 1.8.1 : `/dict/params` doit exposer `value_distribution`
      // (bc4-back 0.15.0). La UI 1.8.1 alimente l'histogramme avec ce
      // champ ; une régression (champ absent / vide / somme incohérente)
      // casserait silencieusement le rendu.
      //
      // Contrat vérifié ici :
      //   • rsrpResult (paramètre numérique) :
      //       - `value_distribution` non vide (plusieurs valeurs
      //         converties attendues) ;
      //       - somme des `count` == `count` du paramètre ;
      //       - au moins une entrée avec `value_converted` non null
      //         (sanity 3GPP, cf. (h.2)) ;
      //       - `value_distribution_mode` dans {exact, binned}.
      //   • dl-Bandwidth (paramètre enum, servi via MasterInformationBlock) :
      //       - `value_distribution_mode === "exact"` ;
      //       - `value_converted === null` pour toutes les entrées ;
      //       - `value_raw` ∈ chaînes ASN.1 (ex. "n100").
      const rsrpRow = base.params.find((p) => p.path.endsWith("rsrpResult"));
      if (!rsrpRow) {
        console.log(`  ⚠ (h.4) rsrpResult absent de la baseline — skip value_distribution`);
      } else {
        const vd = rsrpRow.value_distribution ?? [];
        if (!vd.length) {
          throw new Error(
            `(h.4) rsrpResult.value_distribution vide — bc4-back 0.15.0 attendu`,
          );
        }
        const sum = vd.reduce((a, e) => a + e.count, 0);
        if (sum !== rsrpRow.count) {
          throw new Error(
            `(h.4) somme(value_distribution.count)=${sum} ≠ count=${rsrpRow.count} sur rsrpResult`,
          );
        }
        const hasConverted = vd.some((e) => e.value_converted != null);
        if (!hasConverted) {
          throw new Error(
            `(h.4) rsrpResult : aucune entrée value_distribution avec value_converted non null — conversion 3GPP non appliquée`,
          );
        }
        const mode = rsrpRow.value_distribution_mode ?? "exact";
        if (mode !== "exact" && mode !== "binned") {
          throw new Error(`(h.4) rsrpResult.value_distribution_mode inattendu : ${mode}`);
        }
        console.log(
          `  ✓ (h.4) rsrpResult.value_distribution — ${vd.length} entrées, ` +
            `mode=${mode}, Σcount=${sum} (match count), first=${JSON.stringify(vd[0])}`,
        );
      }

      // Variante enum : récupère MasterInformationBlock → dl-Bandwidth.
      const mibList = await hit(
        `dict.params (TEST2 LTE MasterInformationBlock)`,
        `/projects/${TEST2_ID}/dict/params?system=LTE&message=MasterInformationBlock`,
        ParamListSchema,
      );
      const dlBw = mibList.params.find((p) => p.path === "dl-Bandwidth");
      if (!dlBw) {
        console.log(`  ⚠ (h.4) dl-Bandwidth absent — skip variante enum`);
      } else {
        const vd = dlBw.value_distribution ?? [];
        const mode = dlBw.value_distribution_mode ?? "exact";
        if (!vd.length) {
          console.log(`  ⚠ (h.4) dl-Bandwidth.value_distribution vide (projet sans ingestion)`);
        } else {
          const allEnum = vd.every((e) => e.value_converted == null);
          if (!allEnum) {
            throw new Error(
              `(h.4) dl-Bandwidth : attendu enum (value_converted toujours null), ` +
                `trouvé ${vd.filter((e) => e.value_converted != null).length} entrée(s) convertie(s)`,
            );
          }
          if (mode !== "exact") {
            throw new Error(`(h.4) dl-Bandwidth : mode attendu "exact", trouvé "${mode}"`);
          }
          console.log(
            `  ✓ (h.4) dl-Bandwidth enum — ${vd.length} valeurs ASN.1 (${vd
              .map((e) => e.value_raw)
              .join(", ")}), mode=${mode}`,
          );
        }
      }
    }
  }

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
  // Filtre `arcep=...` sur le dict/tree Paris : cell_ref est VIDE côté
  // back 0.14.0, et le filtre `arcep` n'est de toute façon pas supporté
  // par /dict/tree (confirmé via /openapi.json — seuls op/tech/svc/band/dep
  // sont connus). On skip ce sous-cas tant que l'un ou l'autre n'est pas
  // branché côté back. La UI 1.8.0 n'envoie JAMAIS `arcep` sur /dict/*.
  if (arcepKeys.length === 0) {
    console.log(`  ⚠ G2 : arcep_breakdown vide (cell_ref vide côté back) — filtre non testable`);
  } else {
    console.log("  ⚠ G2 : /dict/tree n'accepte pas 'arcep=' côté back 0.14.0 — skip (UI ne l'envoie pas)");
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

  // G3-renforcé : vérif Rennes NR vide. Rennes est seedé B0 côté back
  // (branches[].techno/channels/messages). On lit en brut puis on vérifie
  // que NR est bien là (invariant Zod côté UI) MAIS avec count=0.
  const rennesRaw = await (await fetch(`${BASE}/projects/${rennes.id}/dict/tree`, {
    headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {},
  })).json();
  type AnyBr = { techno?: string; system?: string; channels?: { messages: { count: number }[] }[]; messages?: { count: number }[] };
  const nrBranch = (rennesRaw?.branches ?? []).find((b: AnyBr) => (b.techno ?? b.system) === "NR");
  if (!nrBranch) throw new Error("G2 : Rennes LTE sans branche NR — contrat UI cassé");
  const nrCount = Array.isArray(nrBranch.channels)
    ? nrBranch.channels.flatMap((c: { messages: { count: number }[] }) => c.messages).reduce((s: number, m: { count: number }) => s + m.count, 0)
    : Array.isArray(nrBranch.messages)
      ? nrBranch.messages.reduce((s: number, m: { count: number }) => s + m.count, 0)
      : 0;
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
