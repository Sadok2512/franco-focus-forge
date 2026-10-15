// Dictionary adapter — 1.8.0.
//
// La UI consomme UNE forme unifiée (`TreeSchema`, `ParamListSchema`,
// `ParamMapSchema`) alignée sur la shape V2 du back. Côté back, deux
// shapes existent historiquement :
//   • V2 (projet ingéré) : `/dict/tree` renvoie `branches[].system/count/
//     messages[].params[]`. `/dict/params` prend `?system=&message=&operator=&band=`.
//     `/dict/param/map` prend `?path=&system=&operator=&band=`.
//   • B0 (projet seedé)  : `/dict/tree` renvoie `branches[].techno/channels[].messages[]`.
//     Pas d'`operator`/`band` sur `/dict/params`. Pas de `path` sur `/dict/param/map`.
// L'adaptateur dispatche sur la forme brute (`system` vs `techno`) et
// mappe tout vers la forme V2 unifiée AVANT validation Zod côté UI.
//
// Dispatch global : VITE_BC4_DATA=api → HTTP ; sinon mock local.

import { DICT_STORE, observationsFor, type Observation, type ParamDef } from "@/mocks/dictionary";
import { PROJECTS } from "./fixtures";
import { apiFetch, apiOrMock, buildQuery } from "./http";
import type { FilterContext } from "./schemas";
import {
  DictProjectSchema,
  ParamListSchema,
  ParamMapSchema,
  TreeB0Schema,
  TreeSchema,
  TreeV2Schema,
  type ConversionRule,
  type DictProject,
  type DictTree,
  type ParamList,
  type ParamMap,
  type ParamRow,
} from "./dictionary-schemas";
import { z } from "zod";

// Filtres pilotés par la barre haute du Dictionnaire.
//
// op/band : SUPPORTÉS par bc4-back 0.14.0 sur /dict/params et
//           /dict/param/map (passés comme `operator`/`band` V2, et
//           comme `op`/`band` pour /dict/tree, cf. openapi.json).
// dr/plaque/arcep : NON SUPPORTÉS tant que `cell_ref` est vide côté
//           back (filtres grisés visuellement — n'arrivent JAMAIS en
//           query string pour éviter un 400 silencieux).
export type DictFilters = Pick<FilterContext, "op" | "band" | "dr" | "plaque" | "arcep">;

const delay = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((res, rej) => {
    const t = setTimeout(res, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      rej(new DOMException("Aborted", "AbortError"));
    });
  });
export const DICT_LATENCY = { ms: 160 };

function projectDims(id: string) {
  const p = PROJECTS.find((x) => x.id === id);
  if (!p) throw { code: "NOT_FOUND", message: "Projet introuvable" };
  const technos = (["LTE", "NR"] as const).filter((t) =>
    t === "LTE" ? p.technologies.includes("LTE") : p.technologies.some((x) => x !== "LTE"),
  );
  return {
    p,
    dims: {
      id: p.id,
      center: p.center,
      operators: p.operators,
      services: p.services,
      technos: [...technos],
      bands: p.bands,
      departements: p.departements,
    },
  };
}

function filtered(id: string, f: DictFilters): Observation[] {
  const { dims } = projectDims(id);
  const defs = new Map(DICT_STORE.params.map((d) => [d.param_id, d]));
  return observationsFor(dims).filter((o) => {
    const d = defs.get(o.param_id)!;
    return (
      (!f.op?.length || f.op.includes(o.operator)) &&
      (!f.band?.length || f.band.includes(o.band)) &&
      // dr/plaque/arcep : non filtrés en mock tant que cell_ref est vide
      // (parité avec le back qui ne les exerce pas sur /dict/*).
      true &&
      !!d
    );
  });
}

export function convert(rule: ConversionRule | null, raw: number | string | null): string | null {
  if (rule == null || raw == null || typeof raw !== "number") return null;
  const v = raw * rule.scale + rule.offset;
  return `${v.toLocaleString("fr-FR", { minimumFractionDigits: rule.decimals, maximumFractionDigits: rule.decimals })} ${rule.unit}`;
}
const convNum = (rule: ConversionRule | null, raw: number) =>
  rule ? +(raw * rule.scale + rule.offset).toFixed(rule.decimals) : raw;

const getDef = (param_id: string) => {
  const d = DICT_STORE.params.find((x) => x.param_id === param_id);
  if (!d) throw { code: "NOT_FOUND", message: "Paramètre introuvable" };
  return d;
};

/** GET /projects/{id}/dict */
export async function getDictProject(id: string, signal?: AbortSignal): Promise<DictProject> {
  return apiOrMock(
    () => apiFetch(`/projects/${encodeURIComponent(id)}/dict`, DictProjectSchema, { signal }),
    () => _mockGetDictProject(id, signal),
    "getDictProject",
  );
}

async function _mockGetDictProject(id: string, signal?: AbortSignal): Promise<DictProject> {
  await delay(DICT_LATENCY.ms, signal);
  const { p, dims } = projectDims(id);
  const res = {
    id,
    dimensions: {
      operators: p.operators,
      services: p.services,
      technos: p.technologies,
      bands: p.bands,
      geo_tree: [
        {
          id: `plaque-${p.id}`,
          label: p.geography,
          level: "plaque" as const,
          children: [
            {
              id: `dr-${p.id}`,
              label: `DR ${p.geography}`,
              level: "dr" as const,
              children: dims.departements.map((d) => ({
                id: d,
                label: `Département ${d}`,
                level: "departement" as const,
                children: [],
              })),
            },
          ],
        },
      ],
      periods: [`${p.periodStart}/${p.periodEnd}`],
    },
  };
  return DictProjectSchema.parse(res);
}

// ---- Mapping brut → V2 unifiée pour /dict/tree -------------------
// Zod union discriminée côté transport uniquement : la UI ne voit
// jamais la shape B0.
const TreeAnySchema = z.union([TreeV2Schema, TreeB0Schema]);

function unifyTreeShape(any: z.infer<typeof TreeAnySchema>): DictTree {
  // Déjà V2 ? on complète juste les branches manquantes (LTE/NR).
  if (any.branches.some((b) => "system" in b)) {
    const v2 = any as z.infer<typeof TreeV2Schema>;
    const byTechno = new Map(v2.branches.map((b) => [b.system, b]));
    const unified = (["LTE", "NR"] as const).map(
      (sys) => byTechno.get(sys) ?? { system: sys, count: 0, messages: [] },
    );
    return TreeSchema.parse({ branches: unified });
  }
  // B0 → V2 (count agrégé, pas de params[] par message).
  const b0 = any as z.infer<typeof TreeB0Schema>;
  const byTechno = new Map(b0.branches.map((b) => [b.techno, b]));
  const unified = (["LTE", "NR"] as const).map((sys) => {
    const br = byTechno.get(sys);
    if (!br) return { system: sys, count: 0, messages: [] };
    const messages = br.channels.flatMap((c) =>
      c.messages.map((m) => ({ message: m.name, count: m.count, params: [] })),
    );
    const total = messages.reduce((a, m) => a + m.count, 0);
    return { system: sys, count: total, messages };
  });
  return TreeSchema.parse({ branches: unified });
}

/** GET /projects/{id}/dict/tree — forme V2 unifiée. */
export async function getDictTree(
  id: string,
  f: DictFilters,
  signal?: AbortSignal,
): Promise<DictTree> {
  return apiOrMock(
    async () => {
      // op / band uniquement (DR/plaque/arcep pas supportés côté back).
      const qs = buildQuery({ op: f.op, band: f.band });
      const raw = await apiFetch(
        `/projects/${encodeURIComponent(id)}/dict/tree${qs}`,
        TreeAnySchema,
        { signal },
      );
      return unifyTreeShape(raw);
    },
    () => _mockGetDictTree(id, f, signal),
    "getDictTree",
  );
}

async function _mockGetDictTree(
  id: string,
  f: DictFilters,
  signal?: AbortSignal,
): Promise<DictTree> {
  await delay(DICT_LATENCY.ms, signal);
  const obs = filtered(id, f);
  const branches = (["LTE", "NR"] as const).map((system) => {
    const defs = DICT_STORE.params.filter((d) => d.techno === system);
    const msgNames = [...new Set(defs.map((d) => d.message))];
    const messages = msgNames.map((name) => {
      const msgDefs = defs.filter((d) => d.message === name);
      const paramIds = new Set(msgDefs.map((d) => d.param_id));
      const msgObs = obs.filter((o) => paramIds.has(o.param_id));
      const paramMap = new Map<string, { count: number }>();
      for (const d of msgDefs) {
        paramMap.set(d.path, {
          count: msgObs.filter((o) => o.param_id === d.param_id).length,
        });
      }
      return {
        message: name,
        count: msgObs.length,
        params: [...paramMap.entries()].map(([param, v]) => ({ param, count: v.count })),
      };
    });
    const count = messages.reduce((a, m) => a + m.count, 0);
    return { system, count, messages };
  });
  return TreeSchema.parse({ branches });
}

// -----------------------------------------------------------------
// /dict/params?system=&message=&operator=&band=
//
// Renvoie la liste des paramètres (identifiés par `path` ASN.1) du
// message sélectionné, avec les buckets par (opérateur, bande).
// -----------------------------------------------------------------
export async function getDictParams(
  id: string,
  system: "LTE" | "NR",
  message: string,
  f: DictFilters,
  signal?: AbortSignal,
): Promise<ParamList> {
  return apiOrMock(
    () => {
      // Attention : le back V2 attend `operator` (singulier), pas `op`.
      // De la même manière, `band` (comma-joined ok).
      const qs = buildQuery({
        system,
        message,
        operator: f.op,
        band: f.band,
      });
      return apiFetch(`/projects/${encodeURIComponent(id)}/dict/params${qs}`, ParamListSchema, {
        signal,
      });
    },
    () => _mockGetDictParams(id, system, message, f, signal),
    "getDictParams",
  );
}

async function _mockGetDictParams(
  id: string,
  system: "LTE" | "NR",
  message: string,
  f: DictFilters,
  signal?: AbortSignal,
): Promise<ParamList> {
  await delay(DICT_LATENCY.ms, signal);
  const obs = filtered(id, f);
  const defs = DICT_STORE.params.filter((d) => d.techno === system && d.message === message);
  const params: ParamRow[] = defs.map((d) => {
    const paramObs = obs.filter((o) => o.param_id === d.param_id);
    // Buckets par (operator, band).
    const bucketKey = (o: Observation) => `${o.operator}|${o.band}`;
    const keys = [...new Set(paramObs.map(bucketKey))];
    const buckets = keys.map((k) => {
      const [operator = "", band = ""] = k.split("|");
      const rows = paramObs.filter((o) => bucketKey(o) === k);
      const nums = rows
        .map((o) => (typeof o.raw === "number" ? convNum(d.conversion_rule, o.raw) : null))
        .filter((v): v is number => v != null);
      return {
        operator,
        band,
        count: rows.length,
        avg_converted: nums.length
          ? +(nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2)
          : null,
      };
    });
    // Dominante (brute + convertie + part) — pré-calculée pour la UI.
    let dominantRaw: number | string | null = null;
    let dominantConverted: number | string | null = null;
    let share: number | null = null;
    if (paramObs.length) {
      const counts = new Map<string | number, number>();
      for (const o of paramObs) counts.set(o.raw, (counts.get(o.raw) ?? 0) + 1);
      let best: string | number = paramObs[0]!.raw;
      let bn = 0;
      for (const [v, n] of counts) {
        if (n > bn || (n === bn && String(v) < String(best))) {
          best = v;
          bn = n;
        }
      }
      dominantRaw = best;
      dominantConverted = typeof best === "number" ? convNum(d.conversion_rule, best) : best;
      share = +(bn / paramObs.length).toFixed(4);
    }
    return {
      system: d.techno,
      message: d.message,
      path: d.path,
      count: paramObs.length,
      unit_converted: d.conversion_rule?.unit ?? null,
      type: d.type,
      value_raw_dominant: dominantRaw,
      value_converted_dominant: dominantConverted,
      share_dominant: share,
      conversion_rule: d.conversion_rule,
      buckets,
    };
  });
  return ParamListSchema.parse({ params });
}

// -----------------------------------------------------------------
// /dict/param/map?path=&system=&operator=&band=
// -----------------------------------------------------------------
export async function getDictParamMap(
  id: string,
  path: string,
  system: "LTE" | "NR",
  f: DictFilters,
  signal?: AbortSignal,
): Promise<ParamMap> {
  return apiOrMock(
    () => {
      const qs = buildQuery({
        path,
        system,
        operator: f.op,
        band: f.band,
      });
      return apiFetch(`/projects/${encodeURIComponent(id)}/dict/param/map${qs}`, ParamMapSchema, {
        signal,
      });
    },
    () => _mockGetDictParamMap(id, path, system, f, signal),
    "getDictParamMap",
  );
}

async function _mockGetDictParamMap(
  id: string,
  path: string,
  system: "LTE" | "NR",
  f: DictFilters,
  signal?: AbortSignal,
): Promise<ParamMap> {
  await delay(DICT_LATENCY.ms, signal);
  // Trouve la définition dont le `path` ASN.1 matche.
  const def = DICT_STORE.params.find((d) => d.techno === system && d.path === path);
  if (!def) return ParamMapSchema.parse({ path, system, points: [] });
  if (def.simulateError)
    throw {
      code: "UPSTREAM_ERROR",
      message: "Erreur simulée du service cartographique (fixture de démonstration).",
    };
  const obs = filtered(id, f).filter(
    (o) => o.param_id === def.param_id && o.lat != null && o.lng != null,
  );
  const points = obs.map((o) => ({
    lat: o.lat!,
    lon: o.lng!,
    value_raw: o.raw,
    value_converted: typeof o.raw === "number" ? convNum(def.conversion_rule, o.raw) : o.raw,
    operator: o.operator,
    band: o.band,
  }));
  return ParamMapSchema.parse({ path, system, points });
}

// -----------------------------------------------------------------
// 1.8.0 — Verrouillage doctrine
//
// • La UI (`DictionaryPage`) ne consomme que la forme V2 unifiée.
//   Les trois endpoints renvoient le même shape quels que soient
//   les paramètres pilotés par la barre de filtres.
// • Les 5 filtres UI sont : Opérateur, Bande, DR, Plaque, Zone ARCEP.
//   Les 2 premiers sont propagés en query string vers le back ; les
//   3 autres sont visuels + grisés tant que `cell_ref` est vide
//   (back 0.14.0 ne les exerce PAS sur /dict/*). On n'envoie JAMAIS
//   un filtre non supporté — pas de 400 silencieux.
// • `null` / absence de valeur → la UI affiche « N/D » ou
//   « aucune valeur observée » — jamais `0` brut, jamais
//   « conversion indisponible » (la règle 3GPP reste affichée dès
//   qu'elle est connue, c'est la valeur qui manque le cas échéant).
// -----------------------------------------------------------------

// -----------------------------------------------------------------
// Internal-only : utilisé par `src/mocks/assistant.ts` (engine mock
// uniquement — VITE_BC4_DATA=mock) pour produire un bloc tableau à
// partir des fixtures C1. Non exporté par `client.ts`, la UI n'y
// touche jamais. Garde le vieux shape `fiche/matrix/histogram` juste
// pour cet usage précis — il sera retiré quand l'assistant mock
// migrera sur /dict/params V2 unifiée.
// -----------------------------------------------------------------
export type LegacyGroupBy = "operator" | "band" | "operator,band";
export type LegacyParamDetail = {
  fiche: {
    techno: "LTE" | "NR";
    message: string;
    path: string;
    leaf: string;
    type: string;
    dominant: {
      value: string | number | null;
      conversion: string | null;
      share: number | null;
    };
    conversion_rule: ConversionRule | null;
  };
  histogram: { label: string; value_num: number | null; count: number }[];
  matrix: {
    bins: string[];
    rows: { key: string; total: number; cells: { bin_index: number; pct: number; n: number }[] }[];
  };
};

export async function getDictParamDetail(
  id: string,
  param_id: string,
  group_by: LegacyGroupBy,
  f: DictFilters,
  signal?: AbortSignal,
): Promise<LegacyParamDetail> {
  await delay(DICT_LATENCY.ms, signal);
  const def = getDef(param_id);
  if (def.simulateError)
    throw {
      code: "UPSTREAM_ERROR",
      message: "Erreur simulée du service d'agrégation (fixture de démonstration).",
    };
  const obs = filtered(id, f).filter((o) => o.param_id === param_id);
  const bins: { label: string; value_num: number | null; match: (o: Observation) => boolean }[] =
    [];
  if (def.spec.kind === "categorical") {
    for (const v of def.spec.values) {
      if (obs.some((o) => o.raw === v))
        bins.push({ label: v, value_num: null, match: (o) => o.raw === v });
    }
  } else {
    const nums = obs.map((o) => o.raw as number);
    if (nums.length) {
      const w = def.spec.binWidth;
      const rule = def.conversion_rule;
      const lo = Math.floor(Math.min(...nums) / w) * w;
      const hi = Math.max(...nums);
      for (let a = lo; a <= hi; a += w) {
        const b = a + w - 1;
        const fmt = (x: number) => convNum(rule, x).toLocaleString("fr-FR");
        const label = w === 1 ? fmt(a) : `${fmt(a)} … ${fmt(b)}`;
        bins.push({
          label: rule ? `${label} ${rule.unit}` : label,
          value_num: convNum(rule, a),
          match: (o) => (o.raw as number) >= a && (o.raw as number) <= b,
        });
      }
    }
  }
  const keyOf = (o: Observation) =>
    group_by === "operator"
      ? o.operator
      : group_by === "band"
        ? o.band
        : `${o.operator} · ${o.band}`;
  const keys = [...new Set(obs.map(keyOf))].sort();
  const rows = keys.map((key) => {
    const ro = obs.filter((o) => keyOf(o) === key);
    return {
      key,
      total: ro.length,
      cells: bins.map((b, bin_index) => {
        const n = ro.filter(b.match).length;
        return { bin_index, n, pct: ro.length ? +((n / ro.length) * 100).toFixed(1) : 0 };
      }),
    };
  });
  let dominantRaw: number | string | null = null;
  let dominantConv: string | null = null;
  let share: number | null = null;
  if (obs.length) {
    const counts = new Map<string | number, number>();
    for (const o of obs) counts.set(o.raw, (counts.get(o.raw) ?? 0) + 1);
    let best: string | number = obs[0]!.raw;
    let bn = 0;
    for (const [v, n] of counts) {
      if (n > bn || (n === bn && String(v) < String(best))) {
        best = v;
        bn = n;
      }
    }
    dominantRaw = best;
    dominantConv = convert(def.conversion_rule, best);
    share = +(bn / obs.length).toFixed(4);
  }
  return {
    fiche: {
      techno: def.techno,
      message: def.message,
      path: def.path,
      leaf: def.path.split(".").at(-1)!,
      type: def.type,
      dominant: { value: dominantRaw, conversion: dominantConv, share },
      conversion_rule: def.conversion_rule,
    },
    histogram: bins.map((b) => ({
      label: b.label,
      value_num: b.value_num,
      count: obs.filter(b.match).length,
    })),
    matrix: { bins: bins.map((b) => b.label), rows },
  };
}
