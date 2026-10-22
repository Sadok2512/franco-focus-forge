// Workspace Table Settings — presentation only, persisted per workspace tab.
// Never alters values, calculations, filters or semantic alert colors.
import { createContext, useContext, useEffect, useState, type CSSProperties } from "react";

export type TableStyle = "clean" | "professional" | "compact";
export type Size3 = "small" | "medium" | "large";
export type Palette = "white" | "lightgray" | "dark" | "blue" | "custom";

export interface TableColors {
  background: string;
  headerBg: string;
  headerText: string;
  rowBg: string;
  altRow: string;
  border: string;
  selected: string;
}

export interface TableSettings {
  perRow: 1 | 2 | 3;
  autoFitWidth: boolean;
  equalHeights: boolean;
  spacing: "compact" | "normal" | "wide";
  height: "auto" | "fixed" | "custom";
  customHeight: number;
  hScroll: "auto" | "always" | "off";
  resizable: boolean;
  style: TableStyle;
  palette: Palette;
  colors: TableColors;
  fontSize: Size3;
  rowHeight: "compact" | "normal" | "comfortable";
  headerHeight: "compact" | "normal" | "large";
  cellPadding: Size3;
  borders: "none" | "horizontal" | "grid";
  zebra: boolean;
  stickyHeader: boolean;
  stickyFirstColumn: boolean;
  wrap: boolean;
  cellAlign: "left" | "center" | "right";
  numberAlign: "right" | "center";
  radius: "square" | "rounded";
  hidden: string[];
  order: string[];
  showUnits: boolean;
  sort: { col: string; dir: "asc" | "desc" } | null;
  search: string;
}

export const PALETTES: Record<Exclude<Palette, "custom">, TableColors> = {
  white: {
    background: "#ffffff",
    headerBg: "#f7f9fc",
    headerText: "#1e293b",
    rowBg: "#ffffff",
    altRow: "#f8fafc",
    border: "#e2e8f0",
    selected: "#dbeafe",
  },
  lightgray: {
    background: "#f4f5f7",
    headerBg: "#e5e7eb",
    headerText: "#111827",
    rowBg: "#f9fafb",
    altRow: "#eef0f3",
    border: "#d1d5db",
    selected: "#dbeafe",
  },
  dark: {
    background: "#0f172a",
    headerBg: "#1e293b",
    headerText: "#f1f5f9",
    rowBg: "#111827",
    altRow: "#1a2233",
    border: "#334155",
    selected: "#1e3a8a",
  },
  blue: {
    background: "#f5f9ff",
    headerBg: "#1e3a8a",
    headerText: "#ffffff",
    rowBg: "#ffffff",
    altRow: "#eef4ff",
    border: "#c7d7f5",
    selected: "#bfdbfe",
  },
};

export const DEFAULT_TABLE_SETTINGS: TableSettings = {
  perRow: 1,
  autoFitWidth: true,
  equalHeights: true,
  spacing: "normal",
  height: "auto",
  customHeight: 480,
  hScroll: "auto",
  resizable: false,
  style: "professional",
  palette: "white",
  colors: PALETTES.white,
  fontSize: "medium",
  rowHeight: "normal",
  headerHeight: "normal",
  cellPadding: "medium",
  borders: "horizontal",
  zebra: true,
  stickyHeader: true,
  stickyFirstColumn: true,
  wrap: false,
  cellAlign: "left",
  numberAlign: "right",
  radius: "rounded",
  hidden: [],
  order: [],
  showUnits: true,
  sort: null,
  search: "",
};

export const STYLE_PRESETS: Record<TableStyle, Partial<TableSettings>> = {
  clean: {
    borders: "horizontal",
    zebra: false,
    rowHeight: "comfortable",
    fontSize: "medium",
    cellPadding: "medium",
  },
  professional: {
    borders: "horizontal",
    zebra: true,
    rowHeight: "normal",
    numberAlign: "right",
    showUnits: true,
  },
  compact: {
    borders: "grid",
    zebra: false,
    rowHeight: "compact",
    headerHeight: "compact",
    fontSize: "small",
    cellPadding: "small",
    stickyHeader: true,
  },
};

const key = (workspaceId: string) => `bc4.tableSettings.${workspaceId}`;
const EVT = "bc4-table-settings";

export function loadTableSettings(workspaceId: string): TableSettings {
  try {
    const raw = localStorage.getItem(key(workspaceId));
    if (raw) {
      const p = JSON.parse(raw) as Partial<TableSettings>;
      return {
        ...DEFAULT_TABLE_SETTINGS,
        ...p,
        colors: { ...DEFAULT_TABLE_SETTINGS.colors, ...p.colors },
      };
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_TABLE_SETTINGS;
}

export function saveTableSettings(workspaceId: string, s: TableSettings) {
  try {
    localStorage.setItem(key(workspaceId), JSON.stringify(s));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(EVT, { detail: workspaceId }));
}

export function useTableSettings(workspaceId: string) {
  const [s, setS] = useState<TableSettings>(() => loadTableSettings(workspaceId));
  useEffect(() => {
    setS(loadTableSettings(workspaceId));
    const h = (e: Event) => {
      if ((e as CustomEvent).detail === workspaceId) setS(loadTableSettings(workspaceId));
    };
    window.addEventListener(EVT, h);
    return () => window.removeEventListener(EVT, h);
  }, [workspaceId]);
  const update = (patch: Partial<TableSettings>) =>
    saveTableSettings(workspaceId, { ...loadTableSettings(workspaceId), ...patch });
  return [s, update] as const;
}

/** Relative luminance contrast ratio (WCAG). */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const n = hex.replace("#", "");
    const c = [0, 2, 4]
      .map((i) => parseInt(n.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}

/** Readable text color for a background. */
export const textFor = (bg: string) =>
  contrastRatio(bg, "#000000") >= contrastRatio(bg, "#ffffff") ? "#0f172a" : "#f8fafc";

/** Sort + search rows without changing values. Null always last. */
export function arrangeRows<
  R extends { values: Record<string, string | number | null | undefined> },
>(rows: R[], s: Pick<TableSettings, "sort">, matches?: (r: R) => boolean): R[] {
  let out = matches ? rows.filter(matches) : rows.slice();
  if (s.sort) {
    const { col, dir } = s.sort;
    out = out.slice().sort((a, b) => {
      const va = a.values[col],
        vb = b.values[col];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const c =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb), undefined, { numeric: true });
      return dir === "asc" ? c : -c;
    });
  }
  return out;
}

export function orderedColumns<C extends { code: string }>(
  cols: C[],
  s: Pick<TableSettings, "order" | "hidden">,
): C[] {
  const idx = (c: C) => {
    const i = s.order.indexOf(c.code);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  return cols.filter((c) => !s.hidden.includes(c.code)).sort((a, b) => idx(a) - idx(b));
}

/** Active workspace id for tables rendered inside panels (KPI/Metrics cards). */
export const TableSettingsWorkspaceContext = createContext<string>("default");

/** Presentation-only CSS vars + data attrs shared by every workspace table. */
export function tableSettingsProps(ts: TableSettings) {
  const style = {
    "--t-bg": ts.colors.background,
    "--t-head-bg": ts.colors.headerBg,
    "--t-head-fg": ts.colors.headerText,
    "--t-row": ts.colors.rowBg,
    "--t-alt": ts.zebra ? ts.colors.altRow : ts.colors.rowBg,
    "--t-border": ts.colors.border,
    "--t-sel": ts.colors.selected,
    "--t-fg": textFor(ts.colors.rowBg),
    "--t-font": { small: "11px", medium: "12px", large: "14px" }[ts.fontSize],
    "--t-row-h": { compact: "22px", normal: "28px", comfortable: "36px" }[ts.rowHeight],
    "--t-head-h": { compact: "26px", normal: "34px", large: "44px" }[ts.headerHeight],
    "--t-pad": { small: "2px 6px", medium: "4px 10px", large: "8px 14px" }[ts.cellPadding],
    "--t-gap": { compact: "0px", normal: "6px", wide: "14px" }[ts.spacing],
    "--t-radius": ts.radius === "rounded" ? "8px" : "0px",
    "--t-align": ts.cellAlign,
    "--t-num-align": ts.numberAlign,
  } as CSSProperties;
  return {
    style,
    "data-style": ts.style,
    "data-borders": ts.borders,
    "data-sticky-head": String(ts.stickyHeader),
    "data-sticky-first": String(ts.stickyFirstColumn),
    "data-wrap": String(ts.wrap),
  };
}

/** Settings of the workspace tab hosting the current panel. */
export function usePanelTableSettings() {
  const ws = useContext(TableSettingsWorkspaceContext);
  const [ts] = useTableSettings(ws);
  return tableSettingsProps(ts);
}
