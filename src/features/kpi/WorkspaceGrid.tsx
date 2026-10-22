import { useEffect, useRef, useState, type ReactNode } from "react";
import { PanelGridContext } from "./PanelShell";
import { workspaceColumns } from "./workspace-grid";
import type { WorkspaceLayout } from "./workspace-tabs";

export function WorkspaceGrid({
  layout,
  count,
  hidden,
  children,
}: {
  layout: WorkspaceLayout;
  count: number;
  hidden?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const cols = workspaceColumns(layout, width, count);
  return (
    <div ref={ref} className="kpi-workspace-grid-viewport" hidden={hidden}>
      <div
        className="kpi-graph-grid"
        data-layout={layout}
        data-columns={cols}
        data-unified="true"
        data-testid="workspace-panel-grid"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(${cols === 1 ? "0" : "260px"}, 1fr))`,
        }}
      >
        <PanelGridContext.Provider value={{ cols }}>{children}</PanelGridContext.Provider>
      </div>
    </div>
  );
}
