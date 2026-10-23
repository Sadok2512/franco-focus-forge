// A metric keeps the visualisation the user asked for in the catalogue ⋮ menu:
// a metric chosen as "table" never gets a graph card. Views live per workspace
// tab in localStorage, the same pattern as the pane mode and table settings.
import type { MetricView } from "./MetricGraphCard";

export type MetricViews = Record<string, MetricView>;

const storageKey = (tabId?: string) =>
  tabId ? `bc3.metrics.views.${tabId}` : "bc3.metrics.views";

export function readMetricViews(tabId?: string): MetricViews {
  try {
    const raw = localStorage.getItem(storageKey(tabId));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const views: MetricViews = {};
    for (const [code, view] of Object.entries(parsed as Record<string, unknown>)) {
      if (view === "graph" || view === "histogram" || view === "table" || view === "map") {
        views[code] = view;
      }
    }
    return views;
  } catch {
    return {};
  }
}

export function writeMetricViews(tabId: string | undefined, views: MetricViews): void {
  try {
    localStorage.setItem(storageKey(tabId), JSON.stringify(views));
  } catch {
    /* storage refused (private mode) — views stay for this tab session only */
  }
}

/** Selections that get a graph card: everything the user did not ask for as a table. */
export function pickGraphSelections<T extends { full: string }>(
  selections: T[],
  views: MetricViews,
): T[] {
  return selections.filter((selection) => views[selection.full] !== "table");
}
