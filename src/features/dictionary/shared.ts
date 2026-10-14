import { queryOptions } from "@tanstack/react-query";
import {
  getDictParamDetail, getDictParamMap, getDictParams, getDictProject, getDictTree, type DictFilters,
} from "@/lib/api/client";
import type { GroupBy } from "@/lib/api/dictionary-schemas";

const fk = (f: DictFilters) => [f.op ?? [], f.tech ?? [], f.svc ?? [], f.band ?? [], f.dep ?? []];

export const dictQ = {
  project: (id: string) => queryOptions({ queryKey: ["dict", id, "project"], queryFn: ({ signal }) => getDictProject(id, signal) }),
  tree: (id: string, f: DictFilters) => queryOptions({ queryKey: ["dict", id, "tree", ...fk(f)], queryFn: ({ signal }) => getDictTree(id, f, signal) }),
  params: (id: string, msg: string, f: DictFilters) => queryOptions({ queryKey: ["dict", id, "params", msg, ...fk(f)], queryFn: ({ signal }) => getDictParams(id, msg, f, signal) }),
  detail: (id: string, param: string, g: GroupBy, f: DictFilters) => queryOptions({ queryKey: ["dict", id, "detail", param, g, ...fk(f)], queryFn: ({ signal }) => getDictParamDetail(id, param, g, f, signal), retry: false }),
  map: (id: string, param: string, f: DictFilters) => queryOptions({ queryKey: ["dict", id, "map", param, ...fk(f)], queryFn: ({ signal }) => getDictParamMap(id, param, f, signal), retry: false }),
};

export const fmtInt = (n: number) => n.toLocaleString("fr-FR");
/** Declared calculation: share (0..1, from API) × 100. */
export const fmtShare = (s: number | null) => (s == null ? "N/D" : `${(s * 100).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`);
export const fmtPct = (p: number) => `${p.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
export const errMsg = (e: unknown) => (e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "Erreur inconnue");

export function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
  a.download = `${name}.csv`; a.click();
}

export type Selection = { msgId: string | null; msgName: string | null; techno: "LTE" | "NR" | null; paramId: string | null };
