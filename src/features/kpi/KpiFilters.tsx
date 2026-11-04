import { Activity, Check, ChevronDown, ListVideo, Link2, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { FilterSelect } from "@/features/dict-v2/FilterSelect";
import { Switch } from "@/components/ui/switch";
import type { ProjectKpiFilters, KpiQueryFilters } from "@/lib/api/project-kpi-schemas";
import type { Superstream } from "@/lib/api/superstreams";
import type { AnalysisScope } from "@/lib/analysis-scope";
import type { FilterDraft, FilterKey } from "./workspace-model";
import { WorkspaceTemplatesMenu } from "./WorkspaceTemplatesMenu";
import { usePointSync } from "./point-sync";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SignalingPanelKind } from "./workspace-tabs";

export type HeaderCapture = { capture_id: string; label: string };

function scopeValue(scope: AnalysisScope | null) {
  if (!scope) return "";
  return scope.type === "capture"
    ? `capture:${scope.captureId}`
    : `superstream:${scope.superstreamId}`;
}

export function KpiFilters({
  draft,
  applied: _applied,
  dimensions,
  dirty,
  loading,
  error,
  onRetry,
  onChange,
  onApply,
  onReset,
  scope,
  captures,
  superstreams,
  sourcesLoading,
  onScopeChange,
  eventsVisible,
  onEventsVisibleChange,
  onAddSignalingPanel,
}: {
  draft: FilterDraft;
  applied: KpiQueryFilters;
  dimensions?: ProjectKpiFilters | undefined;
  period: string | null;
  dirty: boolean;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onChange: (draft: FilterDraft) => void;
  onApply: () => void;
  onReset: () => void;
  scope: AnalysisScope | null;
  captures: HeaderCapture[];
  superstreams: Superstream[];
  sourcesLoading: boolean;
  onScopeChange: (scope: AnalysisScope) => void;
  eventsVisible: boolean;
  onEventsVisibleChange: (visible: boolean) => void;
  onAddSignalingPanel?: (kind: SignalingPanelKind) => void;
}) {
  const { t } = useTranslation();
  const [displayOpen, setDisplayOpen] = useState(false);
  const pointSync = usePointSync();
  const update = (key: FilterKey, values: string[]) =>
    onChange({ ...draft, values: { ...draft.values, [key]: values } });
  const rats = (dimensions?.rats?.values ?? []).filter(
    (value): value is "LTE" | "NR" => value === "LTE" || value === "NR",
  );
  const technologyOptions: { label: string; values: ("LTE" | "NR")[] }[] = [
    { label: "LTE", values: ["LTE"] },
    { label: "NR", values: ["NR"] },
    { label: "LTE + NR", values: ["LTE", "NR"] },
  ];
  const operators = dimensions?.operators;
  const source = scopeValue(scope);

  return (
    <section className="kpi-filterbar kpi-header-v2" aria-label="KPI Analytics Header V2">
      <div className="kpi-header-v2-controls">
        <div className="kpi-header-technology" data-testid="kpi-header-technology">
          <div className="kpi-tech-filter" role="group" aria-label="Technology">
            {technologyOptions.map((option) => {
              const selected =
                option.values.length === 2
                  ? draft.values.rat?.length === 2 &&
                    option.values.every((value) => draft.values.rat?.includes(value))
                  : draft.values.rat?.length === 1 && draft.values.rat[0] === option.values[0];
              return (
                <button
                  type="button"
                  key={option.label}
                  aria-pressed={selected}
                  disabled={loading || !option.values.every((value) => rats.includes(value))}
                  onClick={() => update("rat", option.values)}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="kpi-header-operator" data-testid="kpi-header-operator">
          {operators?.available ? (
            <FilterSelect
              label="Operator"
              showLabel={false}
              operatorBadges
              explicitSelection
              unrestricted={draft.values.operator === undefined}
              onReset={() => {
                const values = { ...draft.values };
                delete values.operator;
                onChange({ ...draft, values });
              }}
              options={operators.values ?? []}
              value={draft.values.operator ?? []}
              onChange={(values) => update("operator", values)}
            />
          ) : (
            <span className="kpi-unavailable-filter" title={operators?.reason ?? undefined}>
              {t("workspaceTemplates.noOperator")}
            </span>
          )}
        </div>

        <label className="kpi-header-source" data-testid="kpi-header-source">
          <select
            aria-label={t("workspaceTemplates.source")}
            value={source}
            disabled={sourcesLoading || (!captures.length && !superstreams.length)}
            onChange={(event) => {
              const [type, id] = event.target.value.split(":", 2);
              if (!id) return;
              if (type === "capture") onScopeChange({ type: "capture", captureId: id });
              else {
                const stream = superstreams.find((candidate) => candidate.id === id);
                if (stream) {
                  onScopeChange({
                    type: "superstream",
                    superstreamId: stream.id,
                    revision: stream.revision,
                  });
                }
              }
            }}
            data-testid="kpi-source-selector"
          >
            {!source && <option value="">{t("workspaceTemplates.selectSource")}</option>}
            <optgroup label={t("workspaceTemplates.captures")}>
              {captures.map((capture) => (
                <option key={capture.capture_id} value={`capture:${capture.capture_id}`}>
                  {capture.label}
                </option>
              ))}
            </optgroup>
            <optgroup label={t("workspaceTemplates.superstreams")}>
              {superstreams.map((stream) => (
                <option key={stream.id} value={`superstream:${stream.id}`}>
                  {stream.name} · {stream.captureIds.length} captures
                </option>
              ))}
            </optgroup>
          </select>
        </label>

        <div className="kpi-header-templates" data-testid="kpi-header-templates">
          <WorkspaceTemplatesMenu />
        </div>

        <DropdownMenu open={displayOpen} onOpenChange={setDisplayOpen}>
          <DropdownMenuTrigger asChild>
            <button type="button" className="kpi-button" data-testid="kpi-display-menu">
              <ListVideo size={14} aria-hidden="true" /> {t("panel.display")}
              <ChevronDown size={13} aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => { setDisplayOpen(false); onAddSignalingPanel?.("l3"); }}>
              <ListVideo aria-hidden="true" /> {t("panel.l3Signaling")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => { setDisplayOpen(false); onAddSignalingPanel?.("timeline"); }}>
              <Activity aria-hidden="true" /> {t("panel.timeline")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <label className="kpi-events-toggle" data-testid="kpi-point-sync-control">
          <span className="flex items-center gap-2 text-xs font-medium">
            <Link2 size={14} aria-hidden="true" />
            <Switch
              checked={pointSync.enabled}
              onCheckedChange={pointSync.setEnabled}
              aria-label={t("panel.pointSync")}
              data-testid="kpi-point-sync-toggle"
            />
            {t(pointSync.enabled ? "panel.pointSyncOn" : "panel.pointSyncOff")}
          </span>
        </label>

        <label className="kpi-events-toggle" data-testid="kpi-header-events">
          <span className="flex items-center gap-2 text-xs font-medium">
            <Switch
              checked={eventsVisible}
              onCheckedChange={onEventsVisibleChange}
              aria-label={`Events ${eventsVisible ? "ON" : "OFF"}`}
              data-testid="kpi-events-toggle"
            />
            {eventsVisible ? "ON" : "OFF"}
          </span>
        </label>

        <button
          type="button"
          className="kpi-button"
          onClick={onReset}
          data-testid="kpi-header-reset"
        >
          <RotateCcw size={13} /> {t("workspaceTemplates.reset")}
        </button>
        <button
          type="button"
          className="kpi-button primary"
          disabled={loading || error || !dirty}
          onClick={onApply}
          data-testid="kpi-header-apply"
        >
          <Check size={14} /> {t("workspaceTemplates.apply")}
        </button>
      </div>
      {dirty && (
        <span role="status" className="kpi-dirty">
          {t("workspaceTemplates.filtersModified")}
        </span>
      )}
      {error && (
        <div role="alert" className="text-xs text-destructive">
          {t("workspaceTemplates.dimensionsUnavailable")}{" "}
          <button className="underline" onClick={onRetry}>
            {t("workspaceTemplates.retry")}
          </button>
        </div>
      )}
    </section>
  );
}
