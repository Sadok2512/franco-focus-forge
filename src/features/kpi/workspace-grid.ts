import type { WorkspaceLayout } from "./workspace-tabs";

export const GRID_GAP = 16;
export const AUTO_PANEL_WIDTH = 420;
export const MIN_PANEL_WIDTH = 260;

/** Derived from the available workspace container, never the browser viewport. */
export function workspaceColumns(layout: WorkspaceLayout, width: number, count: number): number {
  if (layout !== "auto") return Number(layout);
  return Math.max(
    1,
    Math.min(Math.max(1, count), Math.floor((width + GRID_GAP) / (AUTO_PANEL_WIDTH + GRID_GAP))),
  );
}

export function panelColumns(span: number | "full", cols: number): number {
  return span === "full" ? cols : Math.max(1, Math.min(span, cols));
}

/** A table cannot inherit a graph's previously saved narrow span. */
export function effectivePanelSpan(fullRow: boolean, savedSpan: number | "full"): number | "full" {
  return fullRow ? "full" : savedSpan;
}

/** Higher than any panel order a workspace can hold: tables sink below graphs. */
export const TABLE_PANEL_ORDER = 100_000;

/** A table keeps its place among other tables but never rises above a graph. */
export function sunkPanelOrder(fullRow: boolean, order: number): number {
  return fullRow ? TABLE_PANEL_ORDER + order : order;
}
