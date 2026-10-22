// 1.75.0 (BC3) — Spec v2 G4 : barre d'onglets fixée EN BAS du workspace,
// pas au-dessus des graphiques. [+] [Tab1 ×] [Tab2 ×] renommage double-clic,
// drag réordonnement natif HTML5. Un onglet = un contexte KPI indépendant.
import { useState } from "react";
import { Plus, Settings, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { WorkspaceSettingsDialog } from "./WorkspaceSettingsDialog";
import type { WorkspaceTab, WorkspaceLayout } from "./workspace-tabs";

export function WorkspaceTabsBar({
  tabs,
  activeTabId,
  onSelect,
  onCreate,
  onClose,
  onRename,
  onReorder,
  onLayoutChange,
  onOverlayToggle,
  columns = [],
}: {
  tabs: WorkspaceTab[];
  activeTabId: string;
  onSelect: (tabId: string) => void;
  onCreate: () => void;
  onClose: (tabId: string) => void;
  onRename: (tabId: string, name: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onLayoutChange: (tabId: string, layout: WorkspaceLayout) => void;
  onOverlayToggle: (tabId: string, overlay: boolean) => void;
  columns?: { code: string; label: string }[];
}) {
  const { t } = useTranslation();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];
  return (
    <nav
      className="kpi-workspace-tabsbar"
      role="tablist"
      aria-label="Workspace tabs"
      data-testid="workspace-tabs-bar"
    >
      <button
        type="button"
        className="kpi-tab-add"
        onClick={onCreate}
        aria-label="Add tab"
        title="Add tab"
        data-testid="workspace-tab-add"
      >
        <Plus size={14} />
      </button>
      <ol className="kpi-tab-list">
        {tabs.map((tab, index) => {
          const isActive = tab.id === activeTabId;
          return (
            <li
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              className={`kpi-tab ${isActive ? "is-active" : ""} ${draggingIdx === index ? "is-dragging" : ""}`}
              draggable={editing !== tab.id}
              data-testid={`workspace-tab-${index}`}
              onDragStart={(e) => {
                setDraggingIdx(index);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", String(index));
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDrop={(e) => {
                e.preventDefault();
                const from = Number(e.dataTransfer.getData("text/plain"));
                if (!Number.isNaN(from) && from !== index) onReorder(from, index);
                setDraggingIdx(null);
              }}
              onDragEnd={() => setDraggingIdx(null)}
            >
              {editing === tab.id ? (
                <input
                  autoFocus
                  className="kpi-tab-rename"
                  defaultValue={tab.name}
                  onBlur={(e) => {
                    const value = e.target.value.trim();
                    if (value) onRename(tab.id, value);
                    setEditing(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") setEditing(null);
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="kpi-tab-label"
                  onClick={() => onSelect(tab.id)}
                  onDoubleClick={() => setEditing(tab.id)}
                  aria-current={isActive ? "page" : undefined}
                >
                  <span className="kpi-tab-index">{index + 1}</span>
                  <span className="kpi-tab-name">{tab.name}</span>
                </button>
              )}
              {isActive && editing !== tab.id && (
                <button
                  type="button"
                  className="kpi-tab-close"
                  onClick={() => setSettingsOpen(true)}
                  aria-label={t("wss.title")}
                  title={t("wss.title")}
                  data-testid="workspace-settings-open"
                >
                  <Settings size={12} />
                </button>
              )}
              {tabs.length > 1 && (
                <button
                  type="button"
                  className="kpi-tab-close"
                  onClick={() => onClose(tab.id)}
                  aria-label={`Close ${tab.name}`}
                  title="Close tab"
                >
                  <X size={11} />
                </button>
              )}
            </li>
          );
        })}
      </ol>
      {activeTab && (
        <>
          <WorkspaceSettingsDialog
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            workspaceId={activeTab.id}
            layout={activeTab.layout}
            onLayoutChange={(l) => onLayoutChange(activeTab.id, l)}
            columns={columns}
          />
          <button
            type="button"
            className={`kpi-tab-overlay ${activeTab.overlay ? "is-active" : ""}`}
            onClick={() => onOverlayToggle(activeTab.id, !activeTab.overlay)}
            disabled={activeTab.codes.length < 2}
            title={
              activeTab.codes.length < 2
                ? "Overlay nécessite ≥ 2 KPI sélectionnés"
                : activeTab.overlay
                  ? "Désactiver overlay"
                  : "Combiner les KPI dans un graphique"
            }
            data-testid="workspace-overlay-toggle"
            aria-pressed={activeTab.overlay}
          >
            Overlay
          </button>
          <label className="kpi-tab-layout" data-testid="workspace-layout-select">
            <span className="text-[10px] text-muted-foreground">Layout</span>
            <select
              value={activeTab.layout}
              onChange={(e) => onLayoutChange(activeTab.id, e.target.value as WorkspaceLayout)}
              aria-label="Panel layout"
            >
              <option value="auto">Auto</option>
              <option value="1">1 column</option>
              <option value="2">2 columns</option>
              <option value="3">3 columns</option>
            </select>
          </label>
        </>
      )}
    </nav>
  );
}
