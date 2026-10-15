import { exportMetadata } from "@/lib/api/settings";
import { queryOptions } from "@tanstack/react-query";
import {
  getDictParamMap,
  getDictParams,
  getDictProject,
  getDictTree,
  type DictFilters,
} from "@/lib/api/client";

const fk = (f: DictFilters) => [
  f.op ?? [],
  f.band ?? [],
  // dr/plaque/arcep : non propagés en query (back 0.14.0 ne les
  // exerce PAS sur /dict/*). Ils entrent dans la clé pour que les
  // caches soient invalidés quand l'utilisateur sélectionne/déselectionne,
  // mais la requête réseau n'inclut JAMAIS ces filtres tant que le back
  // ne les supporte pas.
  f.dr ?? [],
  f.plaque ?? [],
  f.arcep ?? [],
];

export const dictQ = {
  project: (id: string) =>
    queryOptions({
      queryKey: ["dict", id, "project"],
      queryFn: ({ signal }) => getDictProject(id, signal),
    }),
  tree: (id: string, f: DictFilters) =>
    queryOptions({
      queryKey: ["dict", id, "tree", ...fk(f)],
      queryFn: ({ signal }) => getDictTree(id, f, signal),
    }),
  params: (id: string, system: "LTE" | "NR", message: string, f: DictFilters) =>
    queryOptions({
      queryKey: ["dict", id, "params", system, message, ...fk(f)],
      queryFn: ({ signal }) => getDictParams(id, system, message, f, signal),
    }),
  map: (id: string, path: string, system: "LTE" | "NR", f: DictFilters) =>
    queryOptions({
      queryKey: ["dict", id, "map", system, path, ...fk(f)],
      queryFn: ({ signal }) => getDictParamMap(id, path, system, f, signal),
      retry: false,
    }),
};

export const fmtInt = (n: number) => n.toLocaleString("fr-FR");
export const fmtNum = (n: number, decimals = 2) =>
  n.toLocaleString("fr-FR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
/** Declared calculation: share (0..1, from API) × 100. */
export const fmtShare = (s: number | null | undefined) =>
  s == null
    ? "N/D"
    : `${(s * 100).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
export const fmtPct = (p: number) =>
  `${p.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
export const errMsg = (e: unknown) =>
  e && typeof e === "object" && "message" in e
    ? String((e as { message: unknown }).message)
    : "Erreur inconnue";

export function downloadCsv(name: string, rows: (string | number)[][]) {
  const meta = exportMetadata();
  const head: (string | number)[][] = [
    [`# ${meta.generator}${meta.organization ? ` — Organisation : ${meta.organization}` : ""}`],
  ];
  const csv = [...head, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
    .join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  a.download = `${name}.csv`;
  a.click();
}

/** Sélection courante dans la page Dict : système (LTE/NR) + message
 *  + chemin ASN.1 (= paramètre). `null` sur chaque axe tant que
 *  l'utilisateur n'a pas sélectionné. */
export type Selection = {
  system: "LTE" | "NR" | null;
  message: string | null;
  path: string | null;
};

export const EMPTY_SELECTION: Selection = { system: null, message: null, path: null };

/** Court-nom affiché pour une feuille ASN.1 : la dernière composante
 *  du path (séparateur `/` ou `.`). */
export const leafOf = (path: string): string => path.split(/[./]/).filter(Boolean).at(-1) ?? path;
