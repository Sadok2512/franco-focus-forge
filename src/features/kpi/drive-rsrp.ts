import type { ProjectKpiCatalog, KpiCatalogItem } from "@/lib/api/project-kpi-schemas";

/** RSRP coverage classes (dBm, lower bound inclusive). Presentation only. */
export const RSRP_CLASSES = [
  { id: "excellent", min: -80, color: "#16a34a" },
  { id: "good", min: -90, color: "#84cc16" },
  { id: "fair", min: -100, color: "#facc15" },
  { id: "poor", min: -110, color: "#f97316" },
  { id: "bad", min: -Infinity, color: "#dc2626" },
] as const;

/** Serving-cell RSRP metric code (same series as the Signaling RF timeline). */
export const RSRP_METRIC = "cell_rsrp";

/** Metrics-table selection for the PCell RSRP (the API expects `code@cell`). */
export const RSRP_SELECTION = `${RSRP_METRIC}@0`;

/** `cell_rsrp`, `cell_rsrp@0`, `cell_rsrp@3` — the trailing number is the cell index. */
const RSRP_COLUMN = /^cell_rsrp(?:@(\d+))?$/;

/** Cell index of an RSRP column (`cell_rsrp@2` → 2, bare code → 0); null for any other metric. */
export function rsrpColumnCell(code: string): number | null {
  const m = RSRP_COLUMN.exec(code);
  return m ? Number(m[1] ?? 0) : null;
}

/** True for map points of the serving-cell RSRP, whatever cell index the API echoes. */
export function isRsrpPointCode(code: string): boolean {
  return rsrpColumnCell(code) !== null;
}

export type RsrpClassId = (typeof RSRP_CLASSES)[number]["id"];

/** Class of a measured value; null/non-finite stays null (never coerced). */
export function rsrpClass(value: number | null | undefined): RsrpClassId | null {
  if (value == null || !Number.isFinite(value)) return null;
  return RSRP_CLASSES.find((c) => value >= c.min)!.id;
}

type AnalysisLike = {
  map_points?: { seq: number; lat: number; lng: number; code: string; value: unknown }[];
  rows?: {
    seq_first: number;
    lat?: number | null | undefined;
    lon?: number | null | undefined;
    values: Record<string, unknown>;
  }[];
};

/** Server position of one capture sequence, as supplied by the Signaling points view. */
export type RsrpPosition = {
  seq: number;
  lat: number | null | undefined;
  lng: number | null | undefined;
};

/**
 * Positions the server tied to capture sequences: per-observation points first,
 * then each grouped marker's own sequence list. Only positions the API already
 * published for this capture — nothing is interpolated or guessed.
 */
export function rsrpPositionsFrom(
  points: readonly { seq: number; lat: number | null; lng: number | null }[],
  markers: readonly { lat: number | null; lng: number | null; seqs: readonly number[] }[] = [],
): RsrpPosition[] {
  const out: RsrpPosition[] = points.map((p) => ({ seq: p.seq, lat: p.lat, lng: p.lng }));
  for (const m of markers)
    for (const s of m.seqs) out.push({ seq: s, lat: m.lat, lng: m.lng });
  return out;
}

export type DriveRsrpPoint = {
  seq: number;
  lat: number;
  lng: number;
  value: number;
  cell: number;
  /**
   * Where the position came from: an API map point, the row's own GPS, or the
   * capture's GPS log at the very same sequence. Never a guessed position.
   */
  position_source: "map" | "row" | "capture";
};

const validPos = (lat: unknown, lng: unknown): boolean =>
  typeof lat === "number" &&
  typeof lng === "number" &&
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  Math.abs(lat) <= 90 &&
  Math.abs(lng) <= 180;
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** First sequence → position; the first fix seen for a sequence wins, nothing is interpolated. */
function positionBySeq(positions: RsrpPosition[] | undefined): Map<number, RsrpPosition> {
  const m = new Map<number, RsrpPosition>();
  for (const p of positions ?? []) {
    if (Number.isFinite(p.seq) && validPos(p.lat, p.lng) && !m.has(p.seq)) m.set(p.seq, p);
  }
  return m;
}

/** Numeric RSRP of a table row, preferring the lowest cell index that carries a measurement. */
function rowRsrp(values: Record<string, unknown>): { value: number; cell: number } | null {
  const columns = Object.keys(values)
    .map((code) => ({ code, cell: rsrpColumnCell(code) }))
    .filter((c): c is { code: string; cell: number } => c.cell !== null)
    .sort((a, b) => a.cell - b.cell);
  for (const c of columns) {
    const v = values[c.code];
    if (num(v)) return { value: v, cell: c.cell };
  }
  return null;
}

/**
 * RSRP points with a real position. The API `map_points` come first; when they
 * carry none, the measurements-table rows that hold both a server GPS position
 * and a measured RSRP are used, and rows whose own position is empty are placed
 * on the capture's GPS log at the exact same sequence (no interpolation, no
 * nearest-in-time match, nothing invented).
 */
export function driveRsrpPoints(
  data: AnalysisLike | undefined,
  positions?: RsrpPosition[],
): DriveRsrpPoint[] {
  if (!data) return [];
  const fromMap = (data.map_points ?? [])
    .filter((p) => isRsrpPointCode(p.code) && num(p.value) && validPos(p.lat, p.lng))
    .map((p) => ({
      seq: p.seq,
      lat: p.lat,
      lng: p.lng,
      value: p.value as number,
      cell: rsrpColumnCell(p.code) ?? 0,
      position_source: "map" as const,
    }));
  if (fromMap.length) return fromMap;
  const gps = positionBySeq(positions);
  return (data.rows ?? []).flatMap((r) => {
    const rsrp = rowRsrp(r.values);
    if (!rsrp) return [];
    if (validPos(r.lat, r.lon))
      return [
        {
          seq: r.seq_first,
          lat: r.lat as number,
          lng: r.lon as number,
          value: rsrp.value,
          cell: rsrp.cell,
          position_source: "row" as const,
        },
      ];
    const p = gps.get(r.seq_first);
    if (!p || !validPos(p.lat, p.lng)) return [];
    return [
      {
        seq: r.seq_first,
        lat: p.lat as number,
        lng: p.lng as number,
        value: rsrp.value,
        cell: rsrp.cell,
        position_source: "capture" as const,
      },
    ];
  });
}

/** What the server actually sent, so an empty map can say which part is missing. */
export type DriveRsrpDiagnostics = {
  rows: number;
  rowsWithRsrp: number;
  rowsWithGps: number;
  paired: number;
  mapPoints: number;
  rsrpMapPoints: number;
};

export function driveRsrpDiagnostics(
  data: AnalysisLike | undefined,
  positions?: RsrpPosition[],
): DriveRsrpDiagnostics {
  const rows = data?.rows ?? [];
  const mapPoints = data?.map_points ?? [];
  const gps = positionBySeq(positions);
  let rowsWithRsrp = 0;
  let rowsWithGps = 0;
  let paired = 0;
  for (const r of rows) {
    const hasRsrp = rowRsrp(r.values) !== null;
    if (hasRsrp) rowsWithRsrp++;
    if (validPos(r.lat, r.lon)) rowsWithGps++;
    else if (hasRsrp && gps.has(r.seq_first)) paired++;
  }
  return {
    rows: rows.length,
    rowsWithRsrp,
    rowsWithGps,
    paired,
    mapPoints: mapPoints.length,
    rsrpMapPoints: mapPoints.filter((p) => isRsrpPointCode(p.code)).length,
  };
}

/** First RSRP KPI exposed by the project catalogue (LTE first, available first). */
export function findRsrpKpi(catalog: ProjectKpiCatalog | undefined): KpiCatalogItem | null {
  const items = (catalog?.tree ?? []).flatMap((techno) =>
    techno.families.flatMap((f) => f.kpis.map((k) => ({ k, lte: /lte|4g/i.test(techno.techno) }))),
  );
  const rsrp = items.filter(({ k }) => /rsrp/i.test(`${k.code} ${k.name}`));
  rsrp.sort(
    (a, b) =>
      Number(b.k.available !== false) - Number(a.k.available !== false) ||
      Number(b.lte) - Number(a.lte),
  );
  return rsrp[0]?.k ?? null;
}
