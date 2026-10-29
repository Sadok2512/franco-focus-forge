// DEMO-ONLY : mocks pour la création de projet et l'import NMF tant que
// l'endpoint backend n'est pas branché (bc4-back B1-ingest). Les chiffres
// renvoyés ici sont déterministes et volontairement non "zéroïfiés" :
//   - `gps_coverage_pct` peut être `null` (couverture inconnue) — la UI
//     affiche « N/D », jamais 0 %.
//   - un fichier marqué `status: "error"` renvoie son `error_msg` tel
//     quel, jamais avalé.
//
// 1.5.1 : les projets seedés sont désormais enrichis d'un bloc "ingest"
// (`operators_plmn`, `technos_seen`, `n_captures_ingest`,
// `n_events_ingest`, `gps_coverage_pct`, `status_ingest`) + un rapport
// d'import canné (`by_file[]`) pour que la UI 1.5.1 (colonnes
// Opérateurs/Technologies peuplées + accordéon détail) vive sans back.
import type { NmfImportReport, NmfFileReport } from "@/lib/api/nmf-schemas";
import type { Project } from "@/lib/api/schemas";
import { PROJECTS } from "@/lib/api/fixtures";

const LS_PROJECTS = "bc4.mock.projects.v1";
// 1.6.0 — Deuxième store LS pour les projets seedés « supprimés »
// côté mock. On ne modifie jamais `PROJECTS` (qui alimente les autres
// écrans, Vue d'ensemble notamment) ; on masque l'id depuis
// `listProjectsMock()`.
const LS_HIDDEN = "bc4.mock.projects.hidden.v1";

/** Overlay d'ingestion par id de projet seedé. On garde une table EXPLICITE
 *  plutôt que de dériver des chiffres aléatoires : la UI doit afficher
 *  des valeurs reproductibles. Les PLMN restent BRUTS (`20801`, `20810`,
 *  …) — pas de libellé opérateur inventé, aligné sur le vrai décodeur
 *  `bc4-decoder 1.0.0` du back. */
type IngestOverlay = {
  operators_plmn: Record<string, number> | null;
  technos_seen: Record<string, number> | null;
  n_captures_ingest: number | null;
  n_events_ingest: number | null;
  gps_coverage_pct: number | null;
  status_ingest: "draft" | "importing" | "ready" | "error" | null;
  /** Fichiers vus par le back pour ce projet (base de `by_file[]`). */
  files: Array<{
    filename: string;
    status: NmfFileReport["status"];
    n_captures: number;
    n_events: number;
    n_gps: number;
    decoder_version: string | null;
    error_msg: string | null;
  }>;
};

const INGEST_OVERLAYS: Record<string, IngestOverlay> = {
  "idf-t3-2026": {
    operators_plmn: { "20801": 1200000, "20810": 900000, "20820": 240000, "20815": 60000 },
    technos_seen: { LTE: 1854000, NR: 420000, UMTS: 126000 },
    n_captures_ingest: 2400000,
    n_events_ingest: 2400000,
    gps_coverage_pct: 97.4,
    status_ingest: "ready",
    files: [
      {
        filename: "idf_drive_26S10_lot1.nmf",
        status: "done",
        n_captures: 1,
        n_events: 1200000,
        n_gps: 1170000,
        decoder_version: "bc4-decoder 1.0.0",
        error_msg: null,
      },
      {
        filename: "idf_drive_26S10_lot2.nmf",
        status: "done",
        n_captures: 1,
        n_events: 1200000,
        n_gps: 1168000,
        decoder_version: "bc4-decoder 1.0.0",
        error_msg: null,
      },
    ],
  },
  "lyon-drive-2026": {
    operators_plmn: { "20801": 500000, "20810": 350000 },
    technos_seen: { LTE: 650000, NR: 200000 },
    n_captures_ingest: 850000,
    n_events_ingest: 850000,
    gps_coverage_pct: 99.1,
    status_ingest: "ready",
    files: [
      {
        filename: "lyon_metro_26S07.nmf",
        status: "done",
        n_captures: 1,
        n_events: 850000,
        n_gps: 842000,
        decoder_version: "bc4-decoder 1.0.0",
        error_msg: null,
      },
    ],
  },
  "marseille-5g-2026": {
    operators_plmn: { "20801": 700000, "20820": 300000, "20815": 200000 },
    technos_seen: { NR: 1200000 },
    n_captures_ingest: 1200000,
    n_events_ingest: 1200000,
    gps_coverage_pct: 95.2,
    status_ingest: "ready",
    files: [
      {
        filename: "marseille_5g_26S04.nmf",
        status: "done",
        n_captures: 1,
        n_events: 1200000,
        n_gps: 1142000,
        decoder_version: "bc4-decoder 1.0.0",
        error_msg: null,
      },
    ],
  },
  "rennes-lte-2026": {
    operators_plmn: { "20801": 180000, "20810": 150000, "20820": 80000 },
    technos_seen: { LTE: 410000 },
    n_captures_ingest: 410000,
    n_events_ingest: 410000,
    gps_coverage_pct: 98.7,
    status_ingest: "ready",
    files: [
      {
        filename: "rennes_lte_26S11.nmf",
        status: "done",
        n_captures: 1,
        n_events: 410000,
        n_gps: 404000,
        decoder_version: "bc4-decoder 1.0.0",
        error_msg: null,
      },
    ],
  },
  "lille-indoor-2026": {
    // Projet "processing" → ingestion partielle, un fichier en échec
    // pour exercer la propagation de `error_msg` dans la UI.
    operators_plmn: { "20801": 180000 },
    technos_seen: { LTE: 180000 },
    n_captures_ingest: 180000,
    n_events_ingest: 180000,
    // Indoor pur sur une partie du lot → couverture inconnue, règle « null jamais 0 ».
    gps_coverage_pct: null,
    status_ingest: "error",
    files: [
      {
        filename: "indoor_village_part1.nmf",
        status: "done",
        n_captures: 1,
        n_events: 180000,
        n_gps: 0,
        decoder_version: "bc4-decoder 1.0.0",
        error_msg: null,
      },
      {
        filename: "indoor_village_part2.nmf",
        status: "error",
        n_captures: 0,
        n_events: 0,
        n_gps: 0,
        decoder_version: "bc4-decoder 1.0.0",
        error_msg: "ASN.1: footer tronqué (checksum invalide)",
      },
    ],
  },
  "national-2026": {
    operators_plmn: {
      "20801": 2200000,
      "20810": 1900000,
      "20820": 1100000,
      "20815": 600000,
    },
    technos_seen: { LTE: 4200000, NR: 1400000, UMTS: 200000 },
    n_captures_ingest: 5800000,
    n_events_ingest: 5800000,
    gps_coverage_pct: 96.8,
    status_ingest: "ready",
    files: [
      {
        filename: "nat_bench_26Q1_lot1.nmf",
        status: "done",
        n_captures: 1,
        n_events: 2000000,
        n_gps: 1940000,
        decoder_version: "bc4-decoder 1.0.0",
        error_msg: null,
      },
      {
        filename: "nat_bench_26Q1_lot2.nmf",
        status: "done",
        n_captures: 1,
        n_events: 2000000,
        n_gps: 1932000,
        decoder_version: "bc4-decoder 1.0.0",
        error_msg: null,
      },
      {
        filename: "nat_bench_26Q1_lot3.nmf",
        status: "done",
        n_captures: 1,
        n_events: 1800000,
        n_gps: 1740000,
        decoder_version: "bc4-decoder 1.0.0",
        error_msg: null,
      },
    ],
  },
};

function withIngestOverlay(p: Project): Project {
  const ov = INGEST_OVERLAYS[p.id];
  if (!ov) return p;
  // Compose : les clés "ingest" sont absentes du seed → on les ajoute.
  return {
    ...p,
    operators_plmn: ov.operators_plmn,
    technos_seen: ov.technos_seen,
    n_captures_ingest: ov.n_captures_ingest,
    n_events_ingest: ov.n_events_ingest,
    gps_coverage_pct: ov.gps_coverage_pct,
    status_ingest: ov.status_ingest,
  };
}

function loadExtra(): Project[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LS_PROJECTS);
    return raw ? (JSON.parse(raw) as Project[]) : [];
  } catch {
    return [];
  }
}

function persistExtra(xs: Project[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LS_PROJECTS, JSON.stringify(xs));
}

function slug(s: string): string {
  const base = s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return base || "projet";
}

/** Liste "api-like" fusionnée mock-seed + créations persistées en LS.
 *  Les projets seedés sont enrichis par l'overlay d'ingestion (1.5.1).
 *  1.6.0 — les projets « hidden » (supprimés côté mock) sont filtrés. */
export function listProjectsMock(): Project[] {
  const extra = loadExtra();
  const hidden = loadHidden();
  // Les créations récentes passent devant.
  const all = [...extra, ...PROJECTS.map(withIngestOverlay)];
  return hidden.size ? all.filter((p) => !hidden.has(p.id)) : all;
}

/** Fabrique un Project "vide" prêt pour l'écran de projet. */
export function createProjectMock(
  name: string,
  visibility: "private" | "public",
  parsing: Pick<
    Project,
    | "parse_decode_level"
    | "parse_binning_mode"
    | "parse_temporal_resolution"
    | "parse_spatial_bin_m"
  > = {
    parse_decode_level: "light" as const,
    parse_binning_mode: "temporal" as const,
    parse_temporal_resolution: "native" as const,
    parse_spatial_bin_m: null,
  },
): Project {
  const trimmed = name.trim();
  if (!trimmed) {
    throw Object.assign(new Error("Le nom du projet est obligatoire."), {
      code: "VALIDATION",
      field: "name",
    });
  }
  const extra = loadExtra();
  const used = new Set([...PROJECTS.map((p) => p.id), ...extra.map((p) => p.id)]);
  let id = slug(trimmed);
  if (used.has(id)) {
    let n = 2;
    while (used.has(`${id}-${n}`)) n += 1;
    id = `${id}-${n}`;
  }
  const now = new Date();
  const iso = now.toISOString().slice(0, 10);
  const project: Project = {
    id,
    owner_id: "mock-current-user",
    visibility,
    ...parsing,
    name: trimmed,
    geography: "À définir après le premier import NMF",
    center: [2.35, 46.8],
    operators: [],
    technologies: [],
    services: [],
    bands: [],
    departements: [],
    periodStart: iso,
    periodEnd: iso,
    captures: 0,
    importedAt: iso,
    // Un projet neuf, sans NMF, est "processing" tant qu'aucun import
    // n'a produit de donnée. La UI connaît déjà cette convention.
    status: "processing",
  };
  persistExtra([project, ...extra]);
  return project;
}

/** Lookup pour `getProject(id)` côté mock.
 *  L'overlay d'ingestion est déjà appliqué par `listProjectsMock()`. */
export function findProjectMock(id: string): Project | null {
  return listProjectsMock().find((p) => p.id === id) ?? null;
}

/** 1.6.0 — Supprime un projet côté mock. Deux cas :
 *   - l'id correspond à un projet créé via `createProjectMock` (donc
 *     persisté dans `localStorage`) → on l'enlève de la liste persistée
 *     et on renvoie `true`.
 *   - l'id correspond à un projet seedé (`PROJECTS`) → on NE touche PAS
 *     aux seeds (qui alimentent d'autres écrans) : on tient une liste
 *     explicite d'ids "hidden" dans un second LS, et `listProjectsMock`
 *     les filtre. C'est cohérent avec le back qui, lui, les supprime
 *     réellement — ici on simule l'absence pour la UI.
 *   - id inconnu → `false` (le site d'appel lève `ApiHttpError(404)`
 *     pour aligner le comportement sur l'API réelle). */
function loadHidden(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(LS_HIDDEN);
    return raw ? new Set<string>(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function persistHidden(ids: Set<string>): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LS_HIDDEN, JSON.stringify([...ids]));
}

export function deleteProjectMock(id: string): boolean {
  const extra = loadExtra();
  const inExtra = extra.find((p) => p.id === id);
  if (inExtra) {
    persistExtra(extra.filter((p) => p.id !== id));
    return true;
  }
  const seed = PROJECTS.find((p) => p.id === id);
  if (seed) {
    const hidden = loadHidden();
    if (!hidden.has(id)) {
      hidden.add(id);
      persistHidden(hidden);
    }
    return true;
  }
  return false;
}

function mockCaptureId(projectId: string, filename: string): string {
  return `TEST-MOCK-${projectId}-${filename}`;
}

export function deleteCaptureMock(projectId: string, captureId: string): boolean {
  const overlay = INGEST_OVERLAYS[projectId];
  if (!overlay) return false;
  const index = overlay.files.findIndex(
    (file) => mockCaptureId(projectId, file.filename) === captureId,
  );
  if (index < 0) return false;
  overlay.files.splice(index, 1);
  overlay.n_captures_ingest = overlay.files.reduce((sum, file) => sum + file.n_captures, 0);
  overlay.n_events_ingest = overlay.files.reduce((sum, file) => sum + file.n_events, 0);
  return true;
}

/** Lookup pour `getImportReport(id)` côté mock : construit un rapport
 *  cohérent avec l'overlay d'ingestion. Les totaux (n_captures / n_events
 *  / gps_coverage_pct) sont RECALCULÉS depuis `by_file[]` — la UI exerce
 *  donc le même chemin de dérivation que celui du back. */
export function findImportReportMock(id: string): NmfImportReport | null {
  const ov = INGEST_OVERLAYS[id];
  if (!ov) return null;
  const by_file: NmfFileReport[] = ov.files.map((f) => ({
    ...f,
    capture_ids: [mockCaptureId(id, f.filename)],
  }));
  const files_done = by_file.filter((f) => f.status === "done").length;
  const files_error = by_file.filter((f) => f.status === "error").length;
  // Agrégats dérivés — on remonte les comptes au niveau du PROJET pour
  // qu'un affichage « cumulé » soit cohérent avec l'overlay (sans
  // dépendre d'un recalcul par événement).
  const n_captures = ov.n_captures_ingest ?? 0;
  const n_events = ov.n_events_ingest ?? 0;
  return {
    files_received: by_file.length,
    files_done,
    files_error,
    by_file,
    n_captures,
    n_events,
    gps_coverage_pct: ov.gps_coverage_pct,
    // Opérateurs = PLMN bruts, pas de libellé — alignement 1:1 avec le back.
    operators_seen: ov.operators_plmn ?? {},
    technos_seen: ov.technos_seen ?? {},
  };
}

/** Rapport NMF canné. Un fichier en échec démontre que `error_msg` est
 *  propagé jusqu'à la UI (jamais remplacé par une chaîne vide). */
export function buildNmfReportMock(filenames: string[]): NmfImportReport {
  const by_file: NmfFileReport[] = filenames.map((filename, idx) => {
    // Un fichier sur ~8 est volontairement en erreur pour que la UI
    // démontre l'affichage de `error_msg` non silencieux.
    const errored = idx > 0 && idx % 8 === 0;
    if (errored) {
      return {
        filename,
        status: "error",
        n_captures: 0,
        n_events: 0,
        n_gps: 0,
        decoder_version: "nmf-decoder-0.3.0",
        error_msg: "ASN.1: footer tronqué (checksum invalide)",
        capture_ids: [],
      };
    }
    const n_captures = 1800 + ((idx * 173) % 2400);
    const n_events = 420 + ((idx * 59) % 650);
    // Pour certains fichiers (idx impair + petit), on garde `n_gps = 0`
    // ce qui, à l'échelle du lot, donnera une couverture "connue" mais
    // partielle. Pour d'autres fichiers, le fix GPS n'a pas pu être
    // posé (indoor), ce qui remonte comme `gps_coverage_pct = null`
    // au niveau du rapport global (voir plus bas).
    const n_gps = idx % 3 === 0 ? 0 : Math.floor(n_captures * 0.72);
    return {
      filename,
      status: "done",
      n_captures,
      n_events,
      n_gps,
      decoder_version: "nmf-decoder-0.3.0",
      error_msg: null,
      capture_ids: [`TEST-MOCK-UPLOAD-${idx}`],
    };
  });

  const files_done = by_file.filter((f) => f.status === "done").length;
  const files_error = by_file.filter((f) => f.status === "error").length;
  const n_captures = by_file.reduce((s, f) => s + f.n_captures, 0);
  const n_events = by_file.reduce((s, f) => s + f.n_events, 0);
  const n_gps = by_file.reduce((s, f) => s + f.n_gps, 0);

  // Règle "null jamais 0" : si aucune capture n'a produit de fix GPS
  // (indoor pur), on remonte `null` au lieu d'un 0 % trompeur.
  const gps_coverage_pct =
    n_captures === 0 || n_gps === 0 ? null : +((n_gps / n_captures) * 100).toFixed(1);

  const operators_seen: Record<string, number> = files_done
    ? { Orange: 1 + files_done, SFR: files_done, Bouygues: Math.max(1, files_done - 1), Free: 1 }
    : {};
  const technos_seen: Record<string, number> = files_done
    ? { LTE: files_done, NR: Math.max(0, files_done - 1), "EN-DC": Math.max(0, files_done - 2) }
    : {};

  return {
    files_received: by_file.length,
    files_done,
    files_error,
    by_file,
    n_captures,
    n_events,
    gps_coverage_pct,
    operators_seen,
    technos_seen,
  };
}
