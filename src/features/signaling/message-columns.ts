import type { SignalingLine } from "@/lib/api/signaling";
import type { ProvenState } from "./state-evidence";

/**
 * Messages table column catalog. `available: false` columns are listed in the
 * column selector so users can see what is planned, but they always render "—"
 * because the VM does not supply the field yet (no derivation from PCI/EARFCN).
 */
export type ColKey =
  | "seq"
  | "t_rel_s"
  | "layer"
  | "direction"
  | "message_name"
  | "info"
  | "band"
  | "technology"
  | "rrc_state"
  | "cell_name"
  | "rsrp"
  | "rsrq"
  | "sinr"
  | "size_bytes"
  | "ecgi"
  | "pci"
  | "source"
  | "action";

export type ColDef = { key: ColKey; available: boolean; sortKey?: string; numeric?: boolean };

export const COLUMNS: readonly ColDef[] = [
  { key: "seq", available: true, sortKey: "seq", numeric: true },
  { key: "t_rel_s", available: true, sortKey: "t_rel_s", numeric: true },
  { key: "layer", available: true, sortKey: "protocol" },
  { key: "direction", available: true },
  { key: "message_name", available: true, sortKey: "message_name" },
  { key: "info", available: true },
  { key: "band", available: false },
  { key: "technology", available: true, sortKey: "technology" },
  { key: "rrc_state", available: true },
  { key: "cell_name", available: false },
  { key: "rsrp", available: true, numeric: true },
  { key: "rsrq", available: true, numeric: true },
  { key: "sinr", available: true, numeric: true },
  { key: "size_bytes", available: true, sortKey: "size_bytes", numeric: true },
  { key: "ecgi", available: true, sortKey: "ecgi" },
  { key: "pci", available: true, sortKey: "pci", numeric: true },
  { key: "source", available: true },
  { key: "action", available: true },
];
export const MANDATORY_COLS: readonly ColKey[] = ["seq", "t_rel_s", "message_name"];
/** V11 default order: the twelve reference columns first, extra fields after. */
export const DEFAULT_ORDER: readonly ColKey[] = [
  "seq", "t_rel_s", "layer", "direction", "message_name", "info", "rrc_state",
  "rsrp", "rsrq", "sinr", "size_bytes", "action",
  "technology", "band", "cell_name", "ecgi", "pci", "source",
];
/** Columns rendered centred in the V11 table. */
export const CENTERED_COLS: readonly ColKey[] = [
  "seq", "layer", "direction", "rrc_state", "rsrp", "rsrq", "sinr", "size_bytes", "action", "pci",
];
export const DEFAULT_VISIBLE: readonly ColKey[] = [
  "seq",
  "t_rel_s",
  "layer",
  "direction",
  "message_name",
  "info",
  "rrc_state",
  "rsrp",
  "rsrq",
  "sinr",
  "size_bytes",
  "action",
];

export type ColumnConfig = { order: ColKey[]; visible: ColKey[] };
export const COLUMNS_STORAGE_KEY = "bc4-signaling-columns-v11";
export const defaultColumns = (): ColumnConfig => ({
  order: [...DEFAULT_ORDER],
  visible: [...DEFAULT_VISIBLE],
});

/** Restores a saved config, dropping unknown keys and appending new catalog columns. */
export function parseColumns(raw: string | null): ColumnConfig {
  if (!raw) return defaultColumns();
  try {
    const value = JSON.parse(raw) as Partial<ColumnConfig>;
    const known = new Set<string>(DEFAULT_ORDER);
    const order = (Array.isArray(value.order) ? value.order : []).filter(
      (k): k is ColKey => known.has(k),
    );
    const unique = [...new Set(order)];
    for (const k of DEFAULT_ORDER) if (!unique.includes(k)) unique.push(k);
    const visible = (Array.isArray(value.visible) ? value.visible : []).filter(
      (k): k is ColKey => known.has(k),
    );
    for (const k of MANDATORY_COLS) if (!visible.includes(k)) visible.push(k);
    return { order: unique, visible: [...new Set(visible)] };
  } catch {
    return defaultColumns();
  }
}

export function toggleColumn(config: ColumnConfig, key: ColKey): ColumnConfig {
  if (MANDATORY_COLS.includes(key)) return config;
  const visible = config.visible.includes(key)
    ? config.visible.filter((k) => k !== key)
    : [...config.visible, key];
  return { ...config, visible };
}

export function moveColumn(config: ColumnConfig, key: ColKey, delta: -1 | 1): ColumnConfig {
  const i = config.order.indexOf(key);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= config.order.length) return config;
  const order = [...config.order];
  [order[i], order[j]] = [order[j]!, order[i]!];
  return { ...config, order };
}

export const visibleColumns = (config: ColumnConfig) =>
  config.order.filter((k) => config.visible.includes(k));

// ---------- Info: backend procedures only ----------
type Proc = {
  id: string;
  type: string;
  outcome: string;
  seq_start: number;
  boundary_seqs: number[];
};
export type InfoRole = "info" | "success" | "warning" | "error" | "event" | "neutral";
export type MessageInfo = { label: string; outcome: string; role: InfoRole; kind: InfoKind };
export type InfoKind = "setup" | "release" | "scg" | "handover" | "measurement" | "other";

export function infoKind(type: string): InfoKind {
  const t = type.toLowerCase();
  if (/scg|endc|en-dc/.test(t)) return "scg";
  if (/handover|\bho\b|mobility/.test(t)) return "handover";
  if (/release|detach/.test(t)) return "release";
  if (/measure/.test(t)) return "measurement";
  if (/setup|connection|attach|establish|request/.test(t)) return "setup";
  return "other";
}

/**
 * Classification shown in the Info column. Only procedures supplied by the VM
 * whose start or boundary is this message are shown; colour of failure comes
 * from the VM `outcome`, never from the message name.
 */
export function messageInfo(row: Pick<SignalingLine, "seq" | "procedure_ids">, procedures: Proc[]) {
  const p = procedures.find(
    (q) => row.procedure_ids.includes(q.id) && (q.seq_start === row.seq || q.boundary_seqs.includes(row.seq)),
  );
  if (!p) return null;
  const kind = infoKind(p.type);
  const role: InfoRole =
    p.outcome === "fail"
      ? "error"
      : p.outcome === "incomplete"
        ? "warning"
        : kind === "scg"
          ? "event"
          : kind === "handover"
            ? "warning"
            : kind === "release"
              ? "neutral"
              : p.outcome === "ok" && p.seq_start !== row.seq
                ? "success"
                : "info";
  return { label: p.type, outcome: p.outcome, role, kind } satisfies MessageInfo;
}

// ---------- RRC state: proven intervals only ----------
export type RrcState = "CONNECTED" | "IDLE";
export function rrcStateAt(t: number | null | undefined, states: ProvenState[]) {
  if (t == null) return null;
  const hit = states.find(
    (s) =>
      s.track === "RRC_STATE" &&
      (s.state === "CONNECTED" || s.state === "IDLE") &&
      t >= s.startS &&
      t <= s.endS,
  );
  return hit ? { state: hit.state as RrcState, sessionId: hit.sessionId } : null;
}

// ---------- Radio: previous real observation, never interpolated ----------
type SeriesPoint = { seq: number; t_rel_s: number; value: number | string };
export type RadioReading = { value: number; dtS: number; seq: number; t: number };
/** Latest numeric observation at or before `t`; points must be sorted by time. */
export function radioAt(points: SeriesPoint[] | undefined, t: number | null | undefined) {
  if (!points?.length || t == null) return null;
  let lo = 0,
    hi = points.length - 1,
    found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid]!.t_rel_s <= t) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  for (let i = found; i >= 0; i--) {
    const p = points[i]!;
    if (typeof p.value === "number" && Number.isFinite(p.value))
      return { value: p.value, dtS: t - p.t_rel_s, seq: p.seq, t: p.t_rel_s } satisfies RadioReading;
  }
  return null;
}

/** Page numbers with ellipses: 1 … 4 5 6 … 137 */
export function pageItems(page: number, pages: number): (number | "…")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const from = Math.max(2, page - 1),
    to = Math.min(pages - 1, page + 1);
  if (from > 2) out.push("…");
  for (let i = from; i <= to; i++) out.push(i);
  if (to < pages - 1) out.push("…");
  out.push(pages);
  return out;
}

// ---------- RF value colour: black by default, red only below threshold ----------
export const RF_THRESHOLDS = { rsrp: -110, rsrq: -16, sinr: 0 } as const;
/** Compares the raw numeric value (never a formatted string); equality stays black. */
export function rfAlert(metric: keyof typeof RF_THRESHOLDS, value: number | null | undefined) {
  return value != null && Number.isFinite(value) && value < RF_THRESHOLDS[metric];
}

// ---------- Info / Procedure icon ----------
export type ProcIcon =
  | "radio-tower" | "settings" | "arrow-left-right" | "repeat" | "route"
  | "circle-check" | "circle-x" | "phone-off" | "alert-triangle" | "activity";
export type ProcTone = "purple" | "blue" | "orange" | "green" | "red" | "gray";
/** Icon and colour from the VM procedure type/outcome; Release is never a Drop. */
export function procedureVisual(type: string, outcome: string): { icon: ProcIcon; tone: ProcTone } {
  const t = type.toLowerCase().replace(/[_-]+/g, " ");
  if (/\brlf\b|radio link failure/.test(t)) return { icon: "alert-triangle", tone: "red" };
  const ho = /handover|\bho\b/.test(t);
  if (ho && (outcome === "fail" || /fail/.test(t))) return { icon: "circle-x", tone: "red" };
  if (ho && /success/.test(t)) return { icon: "circle-check", tone: "green" };
  if (/inter ?rat|irat/.test(t)) return { icon: "route", tone: "purple" };
  if (ho && /inter/.test(t)) return { icon: "repeat", tone: "orange" };
  if (ho) return { icon: "arrow-left-right", tone: "blue" };
  if (/scg|endc|en dc/.test(t)) return { icon: "radio-tower", tone: "purple" };
  if (/release|detach/.test(t)) return { icon: "phone-off", tone: "red" };
  if (/reconfig/.test(t)) return { icon: "settings", tone: "blue" };
  if (/setup|establish|connection|attach|request/.test(t)) return { icon: "radio-tower", tone: "purple" };
  return { icon: "activity", tone: "gray" };
}
