import type { MetricView } from "./MetricGraphCard";

export type MetricCardView = Exclude<MetricView, "table">;
export type MetricCardPanel = { id: string; code: string; view: MetricCardView };

const storageKey = (workspaceId: string) => `bc4.metrics.card-panels.${workspaceId}`;
const isCardView = (value: unknown): value is MetricCardView =>
  value === "graph" || value === "histogram" || value === "map";

export function readMetricCardPanels(workspaceId: string): MetricCardPanel[] | null {
  try {
    const raw = localStorage.getItem(storageKey(workspaceId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(
      (panel): panel is MetricCardPanel =>
        !!panel &&
        typeof panel === "object" &&
        typeof (panel as MetricCardPanel).id === "string" &&
        typeof (panel as MetricCardPanel).code === "string" &&
        isCardView((panel as MetricCardPanel).view),
    );
  } catch {
    return null;
  }
}

export function writeMetricCardPanels(workspaceId: string, panels: MetricCardPanel[]): void {
  try {
    localStorage.setItem(storageKey(workspaceId), JSON.stringify(panels));
  } catch {
    /* React state remains authoritative when storage is unavailable. */
  }
}

export function newMetricCardPanel(code: string, view: MetricCardView): MetricCardPanel {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return { id: `metric-panel:${suffix}`, code, view };
}

export function legacyMetricCardPanels(
  selections: string[],
  views: Record<string, MetricView>,
): MetricCardPanel[] {
  return selections.flatMap((code, index) => {
    const view = views[code] ?? "graph";
    return view === "table" ? [] : [{ id: `legacy:${index}:${code}:${view}`, code, view }];
  });
}
