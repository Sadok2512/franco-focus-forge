// DEMO-ONLY : mock pour l'écran de référence cellulaire tant que le backend
// n'est pas branché. Les chiffres ici ne sont pas servis à la démo réelle —
// ils sont là pour que l'UI vive quand VITE_BC4_DATA=mock.
import type { CellSummary, ImportReport, ReferenceImportEntry } from "@/lib/api/reference-schemas";

export const CANNED_IMPORT_REPORT: ImportReport = {
  rows_read: 459_547,
  rows_loaded: 458_112,
  rows_rejected: 1_435,
  rejected_by_reason: {
    bad_position: 812,
    missing_eci: 203,
    missing_nci: 147,
    bad_rat: 189,
    missing_id: 84,
  },
  distinct_eci: 182_410,
  distinct_nci: 61_204,
  by_rat: { "4G": 316_890, "5G": 141_222 },
  bands_unmapped: {},
  etat_breakdown: {
    OPERATIONAL: 441_820,
    SWITCHED_OFF: 10_091,
    OTHER: 6_201,
  },
  // Zone ARCEP (bc4-back 0.7.1) — libellés source LITTÉRAUX ; `"__null"`
  // = bucket NULL (cat_arcep_code vide ou `"(null)"` littéral).
  // Chiffres de démo, somme = rows_loaded (458 112).
  arcep_breakdown: {
    "01/ Top15": 92_410,
    "02/ 200-400 K": 61_205,
    "03/ 50-200 K": 71_820,
    "04/ 10-50 K": 58_014,
    "05/ 5-10 K": 32_410,
    "06/ -de 5 K": 44_120,
    "07/ Hors Agglo": 61_300,
    "08/ ZB_RS": 12_010,
    "10/ Autoroutes": 5_720,
    "11/ TGV": 3_040,
    "12/ Métros_TdB": 1_063,
    __null: 15_000,
  },
  snapshot_date: "2026-10-01",
};

const seq = (() => {
  let n = 0;
  return () => ++n;
})();

const uid = () => `imp-mock-${Date.now().toString(36)}${seq().toString(36)}`;

const LS = "bc4.mock.reference.imports.v1";

function loadHistory(): ReferenceImportEntry[] {
  if (typeof window === "undefined") return [...SEED_HISTORY];
  try {
    const raw = window.localStorage.getItem(LS);
    return raw ? (JSON.parse(raw) as ReferenceImportEntry[]) : [...SEED_HISTORY];
  } catch {
    return [...SEED_HISTORY];
  }
}

function persist(history: ReferenceImportEntry[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LS, JSON.stringify(history));
}

const SEED_HISTORY: ReferenceImportEntry[] = [
  {
    id: "imp-seed-01",
    filename: "ref_cell_4G5G_2026-10-01.csv",
    uploaded_at: "2026-10-01T09:14:03Z",
    actor: "demo.ingenieur",
    snapshot_date: "2026-10-01",
    rows_read: CANNED_IMPORT_REPORT.rows_read,
    rows_loaded: CANNED_IMPORT_REPORT.rows_loaded,
    rows_rejected: CANNED_IMPORT_REPORT.rows_rejected,
    status: "completed",
    report: CANNED_IMPORT_REPORT,
  },
];

export const CANNED_SUMMARY: CellSummary = {
  total: CANNED_IMPORT_REPORT.rows_loaded,
  by_rat: [
    { key: "4G", count: CANNED_IMPORT_REPORT.by_rat["4G"] ?? 0 },
    { key: "5G", count: CANNED_IMPORT_REPORT.by_rat["5G"] ?? 0 },
  ],
  by_band_3gpp: [
    { key: "B3", count: 142_300 },
    { key: "B20", count: 118_040 },
    { key: "B7", count: 36_410 },
    { key: "B1", count: 10_200 },
    { key: "B28", count: 9_940 },
    { key: "n78", count: 128_000 },
    { key: "n28", count: 10_022 },
    { key: "n1", count: 3_200 },
  ],
  by_dor: [
    { key: "UPR Île-de-France", count: 220_000 },
    { key: "UPR Auvergne-Rhône-Alpes", count: 90_000 },
    { key: "UPR Grand Ouest", count: 85_112 },
    { key: "N/D", count: 63_000 },
  ],
  by_dr: [
    { key: "DR Paris", count: 180_000 },
    { key: "DR Lyon", count: 86_000 },
    { key: "DR Rennes", count: 72_000 },
    { key: "DR Marseille", count: 60_000 },
    { key: "N/D", count: 60_112 },
  ],
  // Zone ARCEP (bc4-back 0.7.1) : les lignes NULL tombent sous `N/D`
  // via `_bucket()` côté back, pas sous `__null` (c'est la clé du
  // rapport d'import, pas du summary). Ordre : décroissant par count.
  arcep_breakdown: [
    { key: "01/ Top15", count: 92_410 },
    { key: "03/ 50-200 K", count: 71_820 },
    { key: "02/ 200-400 K", count: 61_205 },
    { key: "07/ Hors Agglo", count: 61_300 },
    { key: "04/ 10-50 K", count: 58_014 },
    { key: "06/ -de 5 K", count: 44_120 },
    { key: "05/ 5-10 K", count: 32_410 },
    { key: "N/D", count: 15_000 },
    { key: "08/ ZB_RS", count: 12_010 },
    { key: "10/ Autoroutes", count: 5_720 },
    { key: "11/ TGV", count: 3_040 },
    { key: "12/ Métros_TdB", count: 1_063 },
  ],
};

export const referenceMock = {
  async upload(filename: string): Promise<ImportReport> {
    // Simule un délai de parsing proportionnel au nom (déterministe).
    await new Promise((r) => setTimeout(r, 200));
    const history = loadHistory();
    history.unshift({
      id: uid(),
      filename,
      uploaded_at: new Date().toISOString(),
      actor: "demo.ingenieur",
      snapshot_date: CANNED_IMPORT_REPORT.snapshot_date,
      rows_read: CANNED_IMPORT_REPORT.rows_read,
      rows_loaded: CANNED_IMPORT_REPORT.rows_loaded,
      rows_rejected: CANNED_IMPORT_REPORT.rows_rejected,
      status: "completed",
      report: CANNED_IMPORT_REPORT,
    });
    persist(history);
    return CANNED_IMPORT_REPORT;
  },
  async imports(): Promise<ReferenceImportEntry[]> {
    await new Promise((r) => setTimeout(r, 80));
    return loadHistory();
  },
  async summary(): Promise<CellSummary> {
    await new Promise((r) => setTimeout(r, 80));
    return CANNED_SUMMARY;
  },
};
