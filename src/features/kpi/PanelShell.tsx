// Common panel frame: bidirectional grid-width/height resize, collapse,
// rename (double-click the title), duplicate when supported. Wraps the
// existing KPI/Metrics cards so their header, Chart Settings, export and
// fullscreen stay the single source of truth. `bare` suppresses only the
// shell chrome: maps still use the same persisted resize affordance as
// graphs and histograms.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { GripVertical } from "lucide-react";

export const PanelGridContext = createContext<{ cols: number }>({ cols: 3 });
export const MapPanelWidthContext = createContext<{
  wide: boolean;
  toggle: () => void;
} | null>(null);
import { useTranslation } from "react-i18next";

import { effectivePanelSpan, panelColumns, sunkPanelOrder } from "./workspace-grid";
import {
  movePanel,
  panelOrder,
  presentPanels,
  usePanelLayout,
  type PanelSpan,
} from "./panel-layout";

export function PanelShell({
  workspaceId,
  id,
  natural,
  defaultTitle,
  fullRow,
  defaultSpan,
  perRow,
  onDuplicate,
  bare = false,
  children,
}: {
  workspaceId: string;
  id: string;
  natural: number;
  defaultTitle: string;
  fullRow?: boolean;
  defaultSpan?: PanelSpan;
  perRow?: 1 | 2 | 3;
  onDuplicate?: (() => void) | undefined;
  bare?: boolean;
  children: (title: string) => ReactNode;
}) {
  const { t } = useTranslation();
  const { cols } = useContext(PanelGridContext);
  const [s, update] = usePanelLayout(workspaceId);
  const [editing, setEditing] = useState(false);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    presentPanels.add(id);
    return () => {
      presentPanels.delete(id);
    };
  }, [id]);
  const title = s.titles[id] || defaultTitle;
  // Tables always reserve an entire row, including when a narrower span was saved.
  const span = effectivePanelSpan(
    !!fullRow,
    perRow
      ? perRow === 1
        ? "full"
        : (Math.max(1, Math.floor(cols / perRow)) as PanelSpan)
      : (s.span[id] ?? defaultSpan ?? 1),
  );
  const collapsed = !!s.collapsed[id];
  const height = s.height[id];
  const nextSpan = (): PanelSpan =>
    span === "full" ? 1 : span === 3 ? 1 : ((span + 1) as PanelSpan);

  return (
    <div
      className={`kpi-panel-shell kpi-panel-enter${dragging ? " is-dragging" : ""}${collapsed ? " is-collapsed" : ""}`}
      data-panel-id={id}
      data-testid={`panel-${id}`}
      style={{
        order: sunkPanelOrder(!!fullRow, panelOrder(s, id, natural)),
        gridColumn: fullRow ? "1 / -1" : `span ${panelColumns(span, cols)}`,
        height: !collapsed && height ? `${height}px` : undefined,
      }}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest("h3")) setEditing(true);
      }}
    >
      <button
        type="button"
        className="kpi-panel-grip"
        title={t("panel.move")}
        aria-label={t("panel.move")}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          setDragging(true);
          let target: HTMLElement | null = null;
          const clearTarget = () => {
            target?.classList.remove("is-drop");
            target = null;
          };
          const onMove = (moveEvent: PointerEvent) => {
            const next = document
              .elementFromPoint(moveEvent.clientX, moveEvent.clientY)
              ?.closest<HTMLElement>(".kpi-panel-shell");
            if (next === target) return;
            clearTarget();
            if (next?.dataset["panelId"] && next.dataset["panelId"] !== id) {
              target = next;
              target.classList.add("is-drop");
            }
          };
          const onUp = (upEvent: PointerEvent) => {
            onMove(upEvent);
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            window.removeEventListener("pointercancel", onCancel);
            const targetId = target?.dataset["panelId"];
            clearTarget();
            setDragging(false);
            if (targetId && targetId !== id) {
              update((p) => movePanel(p, [...presentPanels], id, targetId));
            }
          };
          const onCancel = () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            window.removeEventListener("pointercancel", onCancel);
            clearTarget();
            setDragging(false);
          };
          window.addEventListener("pointermove", onMove);
          window.addEventListener("pointerup", onUp);
          window.addEventListener("pointercancel", onCancel);
        }}
      >
        <GripVertical size={14} aria-hidden="true" />
      </button>
      {!bare && editing && (
        <input
          autoFocus
          className="kpi-panel-rename"
          defaultValue={title}
          aria-label={t("panel.rename")}
          onBlur={(e) => {
            const v = e.target.value.trim();
            update((p) => {
              const titles = { ...p.titles };
              if (v && v !== defaultTitle) titles[id] = v;
              else delete titles[id];
              return { ...p, titles };
            });
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setEditing(false);
          }}
        />
      )}
      <MapPanelWidthContext.Provider
        value={{
          wide: panelColumns(span, cols) === cols,
          toggle: () =>
            update((p) => ({
              ...p,
              span: {
                ...p.span,
                [id]: panelColumns(span, cols) === cols ? 1 : (cols as PanelSpan),
              },
            })),
        }}
      >
        {children(title)}
      </MapPanelWidthContext.Provider>
      {!collapsed && (
        <span
          className="kpi-panel-resize"
          title={t("panel.resize")}
          aria-label={t("panel.resize")}
          onPointerDown={(e) => {
            const el = e.currentTarget.parentElement as HTMLElement;
            // Metric cards sit below a `display: contents` wrapper, whose
            // bounding box is empty. Always measure the real workspace grid.
            const grid = el.closest<HTMLElement>(".kpi-graph-grid") ?? el.parentElement;
            const startRect = el.getBoundingClientRect();
            const startX = e.clientX;
            const startY = e.clientY;
            const startH = startRect.height;
            const startColumns = panelColumns(span, cols);
            const gridWidth = grid?.getBoundingClientRect().width ?? startRect.width;
            const gridStyle = grid ? window.getComputedStyle(grid) : null;
            const gap = Number.parseFloat(gridStyle?.columnGap ?? "0") || 0;
            const columnWidth = (gridWidth - gap * Math.max(0, cols - 1)) / cols;
            let resizedColumns = startColumns;
            e.preventDefault();
            const onMove = (m: PointerEvent) => {
              el.style.height = `${Math.max(180, startH + m.clientY - startY)}px`;
              if (!fullRow && cols > 1 && columnWidth > 0) {
                const requestedWidth = startRect.width + m.clientX - startX;
                resizedColumns = Math.max(
                  1,
                  Math.min(cols, Math.round((requestedWidth + gap) / (columnWidth + gap))),
                );
                el.style.gridColumn = `span ${resizedColumns}`;
              }
              window.dispatchEvent(new CustomEvent("bc4:workspace-resize"));
            };
            const onUp = (m: PointerEvent) => {
              window.removeEventListener("pointermove", onMove);
              window.removeEventListener("pointerup", onUp);
              const h = Math.max(180, Math.round(startH + m.clientY - startY));
              update((p) => ({
                ...p,
                height: { ...p.height, [id]: h },
                span: fullRow ? p.span : { ...p.span, [id]: resizedColumns as PanelSpan },
              }));
              window.dispatchEvent(new CustomEvent("bc4:workspace-resize"));
            };
            window.addEventListener("pointermove", onMove);
            window.addEventListener("pointerup", onUp);
          }}
        />
      )}
    </div>
  );
}
