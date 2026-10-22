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
