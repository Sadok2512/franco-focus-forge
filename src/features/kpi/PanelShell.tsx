// Common panel frame: drag to move, width span, height resize, collapse,
// rename (double-click the title), duplicate when supported. Wraps the
// existing KPI/Metrics cards so their header, Chart Settings, export and
// fullscreen stay the single source of truth.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export const PanelGridContext = createContext<{ cols: number }>({ cols: 3 });
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, Columns2, Copy, GripVertical, Pencil } from "lucide-react";
import { panelColumns } from "./workspace-grid";
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
  perRow,
  onDuplicate,
  children,
}: {
  workspaceId: string;
  id: string;
  natural: number;
  defaultTitle: string;
  fullRow?: boolean;
  perRow?: 1 | 2 | 3;
  onDuplicate?: (() => void) | undefined;
  children: (title: string) => ReactNode;
}) {
  const { t } = useTranslation();
  const { cols } = useContext(PanelGridContext);
  const [s, update] = usePanelLayout(workspaceId);
  const [editing, setEditing] = useState(false);
  const [over, setOver] = useState(false);
  useEffect(() => {
    presentPanels.add(id);
    return () => {
      presentPanels.delete(id);
    };
  }, [id]);
  const title = s.titles[id] || defaultTitle;
  // Table settings "N tables per row" overrides the saved span for table panels.
  const span: PanelSpan | "full" = perRow
    ? perRow === 1
      ? "full"
      : (Math.max(1, Math.floor(cols / perRow)) as PanelSpan)
    : (s.span[id] ?? (fullRow ? "full" : 1));
  const collapsed = !!s.collapsed[id];
  const height = s.height[id];
  const nextSpan = (): PanelSpan =>
    span === "full" ? 1 : span === 3 ? 1 : ((span + 1) as PanelSpan);

  return (
    <div
      className={`kpi-panel-shell kpi-panel-enter${over ? " is-drop" : ""}${collapsed ? " is-collapsed" : ""}`}
      data-panel-id={id}
      data-testid={`panel-${id}`}
      style={{
        order: panelOrder(s, id, natural),
        gridColumn: `span ${panelColumns(span, cols)}`,
        height: !collapsed && height ? `${height}px` : undefined,
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("application/x-bc4-panel")) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        const from = e.dataTransfer.getData("application/x-bc4-panel");
        if (from && from !== id) update((p) => movePanel(p, [...presentPanels], from, id));
      }}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest("h3")) setEditing(true);
      }}
    >
      <div className="kpi-panel-tools">
        <span
          draggable
          className="kpi-panel-grip"
          title={t("panel.move")}
          aria-label={t("panel.move")}
          onDragStart={(e) => {
            e.dataTransfer.setData("application/x-bc4-panel", id);
            e.dataTransfer.effectAllowed = "move";
          }}
        >
          <GripVertical size={12} />
        </span>
        <button
          type="button"
          title={t("panel.rename")}
          aria-label={t("panel.rename")}
          onClick={() => setEditing(true)}
        >
          <Pencil size={11} />
        </button>
        <button
          type="button"
          title={t("panel.width")}
          aria-label={t("panel.width")}
          onClick={() => update((p) => ({ ...p, span: { ...p.span, [id]: nextSpan() } }))}
        >
          <Columns2 size={11} />
          <small>{span === "full" ? "↔" : span}</small>
        </button>
        {onDuplicate && (
          <button
            type="button"
            title={t("panel.duplicate")}
            aria-label={t("panel.duplicate")}
            onClick={onDuplicate}
          >
            <Copy size={11} />
          </button>
        )}
        <button
          type="button"
          title={t(collapsed ? "panel.expand" : "panel.collapse")}
          aria-label={t(collapsed ? "panel.expand" : "panel.collapse")}
          onClick={() => update((p) => ({ ...p, collapsed: { ...p.collapsed, [id]: !collapsed } }))}
        >
          {collapsed ? <ChevronDown size={11} /> : <ChevronUp size={11} />}
        </button>
      </div>
      {editing && (
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
      {children(title)}
      {!collapsed && (
        <span
          className="kpi-panel-resize"
          title={t("panel.resize")}
          aria-label={t("panel.resize")}
          onPointerDown={(e) => {
            const el = e.currentTarget.parentElement as HTMLElement;
            const startY = e.clientY,
              startH = el.getBoundingClientRect().height;
            const onMove = (m: PointerEvent) => {
              el.style.height = `${Math.max(180, startH + m.clientY - startY)}px`;
            };
            const onUp = (m: PointerEvent) => {
              window.removeEventListener("pointermove", onMove);
              window.removeEventListener("pointerup", onUp);
              const h = Math.max(180, Math.round(startH + m.clientY - startY));
              update((p) => ({ ...p, height: { ...p.height, [id]: h } }));
            };
            window.addEventListener("pointermove", onMove);
            window.addEventListener("pointerup", onUp);
          }}
        />
      )}
    </div>
  );
}
