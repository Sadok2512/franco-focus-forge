// Mock adapter for the Dictionary endpoints (§6). Swap the body of `request` for a
// real fetch to `/projects/{id}/...` when the backend exists; UI code stays the same.
import { DICT_STORE, observationsFor, type Observation, type ParamDef } from "@/mocks/dictionary";
import { PROJECTS } from "./fixtures";
import type { FilterContext } from "./schemas";
import {
  DictProjectSchema, ParamDetailSchema, ParamListSchema, ParamMapSchema, TreeSchema,
  type ConversionRule, type DictProject, type DictTree, type GroupBy, type ParamDetail, type ParamList, type ParamMap,
} from "./dictionary-schemas";

export type DictFilters = Pick<FilterContext, "op" | "tech" | "svc" | "band" | "dep">;

const delay = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((res, rej) => {
    const t = setTimeout(res, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); rej(new DOMException("Aborted", "AbortError")); });
  });
export const DICT_LATENCY = { ms: 160 };

function projectDims(id: string) {
  const p = PROJECTS.find((x) => x.id === id);
  if (!p) throw { code: "NOT_FOUND", message: "Projet introuvable" };
  const technos = (["LTE", "NR"] as const).filter((t) => t === "LTE" ? p.technologies.includes("LTE") : p.technologies.some((x) => x !== "LTE"));
  return { p, dims: { id: p.id, center: p.center, operators: p.operators, services: p.services, technos: [...technos], bands: p.bands, departements: p.departements } };
}

function filtered(id: string, f: DictFilters): Observation[] {
  const { dims } = projectDims(id);
  const techOk = (t: "LTE" | "NR") => !f.tech?.length || (t === "LTE" ? f.tech.includes("LTE") : f.tech.includes("NR") || f.tech.includes("EN-DC"));
  const defs = new Map(DICT_STORE.params.map((d) => [d.param_id, d]));
  return observationsFor(dims).filter((o) => {
    const d = defs.get(o.param_id)!;
    return techOk(d.techno) && (!f.op?.length || f.op.includes(o.operator)) && (!f.svc?.length || f.svc.includes(o.service)) &&
      (!f.band?.length || f.band.includes(o.band)) && (!f.dep?.length || f.dep.includes(o.dep));
  });
}

export function convert(rule: ConversionRule | null, raw: number | string | null): string | null {
  if (rule == null || raw == null || typeof raw !== "number") return null;
  const v = raw * rule.scale + rule.offset;
  return `${v.toLocaleString("fr-FR", { minimumFractionDigits: rule.decimals, maximumFractionDigits: rule.decimals })} ${rule.unit}`;
}
const convNum = (rule: ConversionRule | null, raw: number) => (rule ? +(raw * rule.scale + rule.offset).toFixed(rule.decimals) : raw);

function dominantOf(def: ParamDef, obs: Observation[]) {
  if (!obs.length) return { value: null, conversion: null, share: null };
  const counts = new Map<string | number, number>();
  for (const o of obs) counts.set(o.raw, (counts.get(o.raw) ?? 0) + 1);
  let best: string | number = obs[0]!.raw, bn = 0;
  for (const [v, n] of counts) if (n > bn || (n === bn && String(v) < String(best))) { best = v; bn = n; }
  return { value: best, conversion: convert(def.conversion_rule, best), share: +(bn / obs.length).toFixed(4) };
}

function binsFor(def: ParamDef, obs: Observation[]) {
  if (def.spec.kind === "categorical") {
    const vals = def.spec.values.filter((v) => obs.some((o) => o.raw === v));
    return vals.map((v) => ({ label: v, value_num: null as number | null, match: (o: Observation) => o.raw === v }));
  }
  const nums = obs.map((o) => o.raw as number);
  if (!nums.length) return [];
  const w = def.spec.binWidth, rule = def.conversion_rule;
  const lo = Math.floor(Math.min(...nums) / w) * w, hi = Math.max(...nums);
  const out = [];
  for (let a = lo; a <= hi; a += w) {
    const b = a + w - 1;
    const fmt = (x: number) => convNum(rule, x).toLocaleString("fr-FR");
    const label = w === 1 ? fmt(a) : `${fmt(a)} … ${fmt(b)}`;
    out.push({ label: rule ? `${label} ${rule.unit}` : label, value_num: convNum(rule, a), match: (o: Observation) => (o.raw as number) >= a && (o.raw as number) <= b });
  }
  return out;
}

const getDef = (param_id: string) => {
  const d = DICT_STORE.params.find((x) => x.param_id === param_id);
  if (!d) throw { code: "NOT_FOUND", message: "Paramètre introuvable" };
  return d;
};

/** GET /projects/{id} */
export async function getDictProject(id: string, signal?: AbortSignal): Promise<DictProject> {
  await delay(DICT_LATENCY.ms, signal);
  const { p, dims } = projectDims(id);
  const res = {
    id,
    dimensions: {
      operators: p.operators, services: p.services, technos: p.technologies, bands: p.bands,
      geo_tree: [{ id: `plaque-${p.id}`, label: p.geography, level: "plaque" as const, children: [{
        id: `dr-${p.id}`, label: `DR ${p.geography}`, level: "dr" as const,
        children: dims.departements.map((d) => ({ id: d, label: `Département ${d}`, level: "departement" as const, children: [] })),
      }] }],
      periods: [`${p.periodStart}/${p.periodEnd}`],
    },
  };
  return DictProjectSchema.parse(res);
}

/** GET /projects/{id}/dict/tree */
export async function getDictTree(id: string, f: DictFilters, signal?: AbortSignal): Promise<DictTree> {
  await delay(DICT_LATENCY.ms, signal);
  const { dims } = projectDims(id);
  const obs = filtered(id, f);
  const branches = (["LTE", "NR"] as const).map((techno) => {
    if (!dims.technos.includes(techno)) return { techno, channels: [] };
    const defs = DICT_STORE.params.filter((d) => d.techno === techno);
    const channels = [...new Set(defs.map((d) => d.channel))].map((name) => ({
      name,
      messages: [...new Map(defs.filter((d) => d.channel === name).map((d) => [d.msg_id, d.message]))].map(([msg_id, mname]) => ({
        msg_id, name: mname, count: obs.filter((o) => defs.find((d) => d.param_id === o.param_id)?.msg_id === msg_id).length,
      })),
    }));
    return { techno, channels };
  });
  return TreeSchema.parse({ branches });
}

/** GET /projects/{id}/dict/param?message={msg_id} */
export async function getDictParams(id: string, msg_id: string, f: DictFilters, signal?: AbortSignal): Promise<ParamList> {
  await delay(DICT_LATENCY.ms, signal);
  const obs = filtered(id, f);
  const params = DICT_STORE.params.filter((d) => d.msg_id === msg_id).map((d) => {
    const o = obs.filter((x) => x.param_id === d.param_id);
    return { param_id: d.param_id, leaf: d.path.split(".").at(-1)!, path: d.path, n: o.length, distinct: new Set(o.map((x) => x.raw)).size, dominant: dominantOf(d, o) };
  });
  return ParamListSchema.parse({ params });
}

/** GET /projects/{id}/dict/param?param_id={id}&group_by=... */
export async function getDictParamDetail(id: string, param_id: string, group_by: GroupBy, f: DictFilters, signal?: AbortSignal): Promise<ParamDetail> {
  await delay(DICT_LATENCY.ms, signal);
  const def = getDef(param_id);
  if (def.simulateError) throw { code: "UPSTREAM_ERROR", message: "Erreur simulée du service d'agrégation (fixture de démonstration)." };
  const obs = filtered(id, f).filter((o) => o.param_id === param_id);
  const bins = binsFor(def, obs);
  const keyOf = (o: Observation) => group_by === "operator" ? o.operator : group_by === "band" ? o.band : `${o.operator} · ${o.band}`;
  const keys = [...new Set(obs.map(keyOf))].sort();
  const rows = keys.map((key) => {
    const ro = obs.filter((o) => keyOf(o) === key);
    return {
      key, total: ro.length,
      cells: bins.map((b, bin_index) => { const n = ro.filter(b.match).length; return { bin_index, n, pct: +((n / ro.length) * 100).toFixed(1) }; }),
    };
  });
  return ParamDetailSchema.parse({
    fiche: { techno: def.techno, message: def.message, path: def.path, leaf: def.path.split(".").at(-1)!, type: def.type, dominant: dominantOf(def, obs), conversion_rule: def.conversion_rule },
    histogram: bins.map((b) => ({ label: b.label, value_num: b.value_num, count: obs.filter(b.match).length })),
    matrix: { bins: bins.map((b) => b.label), rows },
  });
}

/** GET /projects/{id}/dict/param/map?param_id={id} */
export async function getDictParamMap(id: string, param_id: string, f: DictFilters, signal?: AbortSignal): Promise<ParamMap> {
  await delay(DICT_LATENCY.ms, signal);
  const def = getDef(param_id);
  if (def.simulateError) throw { code: "UPSTREAM_ERROR", message: "Erreur simulée du service cartographique (fixture de démonstration)." };
  const obs = filtered(id, f).filter((o) => o.param_id === param_id && o.lat != null && o.lng != null);
  const features = obs.map((o) => {
    const value = typeof o.raw === "number" ? convNum(def.conversion_rule, o.raw) : o.raw;
    return { type: "Feature" as const, geometry: { type: "Point" as const, coordinates: [o.lng!, o.lat!] as [number, number] },
      properties: { value, display: convert(def.conversion_rule, o.raw) ?? `${o.raw}${typeof o.raw === "number" ? " (index brut)" : ""}` } };
  });
  let legend: ParamMap["legend"];
  if (def.spec.kind === "numeric") {
    const vals = features.map((x) => x.properties.value as number).sort((a, b) => a - b);
    const q = (p: number) => vals[Math.min(vals.length - 1, Math.floor(p * vals.length))]!;
    const unit = def.conversion_rule?.unit ?? "index";
    legend = { kind: "numeric", stops: vals.length ? [0, 0.2, 0.4, 0.6, 0.8].map((p) => q(p)).filter((v, i, a) => a.indexOf(v) === i).map((v) => ({ value: v, label: `≥ ${v.toLocaleString("fr-FR")} ${unit}` })) : [] };
  } else {
    legend = { kind: "categorical", classes: def.spec.values.filter((v) => obs.some((o) => o.raw === v)).map((v) => ({ value: v, label: v })) };
  }
  return ParamMapSchema.parse({ type: "FeatureCollection", features, legend });
}
