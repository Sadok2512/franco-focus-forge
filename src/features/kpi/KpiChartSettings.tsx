import { useTranslation } from "react-i18next";
import { useState } from "react";
import type { KpiGroupBy } from "@/lib/api/project-kpi-schemas";
import {
  GROUP_LABELS,
  XY_UNAVAILABLE,
  type ChartConfig,
  type CurveType,
} from "./visualization-model";
import { STAT_LABELS, type Statistic } from "./workspace-model";

export function KpiChartSettings({
  config,
  name,
  unit,
  groupOptions,
  choices,
  temporal = false,
  onApply,
  onCancel,
}: {
  config: ChartConfig;
  temporal?: boolean;
  name: string;
  unit: string | null;
  groupOptions: KpiGroupBy[];
  choices: Statistic[];
  onApply: (next: ChartConfig) => void;
  onCancel: () => void;
}) {
  const { t: translate } = useTranslation();
  const [draft, setDraft] = useState(config);
  return (
    <form
      className="kpi-chart-settings"
      aria-label={`Axes ${name}`}
      onSubmit={(event) => {
        event.preventDefault();
        onApply(draft);
      }}
    >
      <h4 className="font-semibold text-sm">{translate("kpi.a9b06cf1234b")}</h4>
      <p className="text-xs text-muted-foreground truncate" title={name}>
        {name}
      </p>
      <label>
        {" "}
        {translate("kpi.8d1d4c5be066")}{" "}
        <select
          aria-label={translate("kpi.8d1d4c5be066")}
          value={draft.visualization === "histogram" ? "histogram" : (draft.curveType ?? "line")}
          onChange={(e) =>
            e.target.value === "histogram"
              ? setDraft({ ...draft, visualization: "histogram" })
              : setDraft({
                  ...draft,
                  curveType: e.target.value as CurveType,
                  visualization: draft.visualization === "task_series" ? "task_series" : "graph",
                })
          }
        >
          {!temporal && <option value="histogram">{translate("kpi.86eb05ab111d")}</option>}
          <option value="points">Points</option>
          <option value="line">{translate("kpi.909f8f071b0f")}</option>
          <option value="line_points">{translate("kpi.dd8d44e93faf")}</option>
        </select>
      </label>
      <p className="text-[11px] text-muted-foreground">
        {temporal ? translate("kpi.1f1fb0ff2f13") : translate("kpi.25179b3671af")}
        {unit ? translate("kpi.12d31f5866e9", { v0: unit }) : ""}
      </p>
      <label>
        {" "}
        {translate("kpi.c3bd9d755359")}{" "}
        <select
          aria-label={translate("kpi.c3bd9d755359")}
          disabled={temporal}
          value={draft.xMetric}
          onChange={(e) =>
            setDraft({
              ...draft,
              xMetric: e.target.value as KpiGroupBy,
              groupBy: e.target.value as KpiGroupBy,
            })
          }
        >
          {temporal && (
            <option value={draft.xMetric}>
              {draft.visualization === "task_series" ? "Task Time" : translate("kpi.5515e9e00225")}
            </option>
          )}
          {!temporal && !groupOptions.includes(draft.xMetric) && (
            <option value={draft.xMetric} disabled>
              {GROUP_LABELS[draft.xMetric]} {translate("kpi.3594192b391d")}{" "}
            </option>
          )}
          {!temporal &&
            groupOptions.map((group) => (
              <option key={group} value={group}>
                {GROUP_LABELS[group]}
              </option>
            ))}
        </select>
      </label>
      <label>
        {" "}
        {translate("kpi.9423c73cf78f")}{" "}
        <select aria-label={translate("kpi.9423c73cf78f")} value={draft.yMetric} disabled>
          <option value={config.kpiCode}>
            {name} · {unit ?? translate("kpi.8246d8942ee4")}
          </option>
        </select>
      </label>
      <label>
        {" "}
        {translate("kpi.37299112843a")}{" "}
        <select
          aria-label={translate("kpi.43ad78294142")}
          disabled={temporal}
          value={draft.groupBy}
          onChange={(e) =>
            setDraft({
              ...draft,
              groupBy: e.target.value as KpiGroupBy,
              xMetric: e.target.value as KpiGroupBy,
            })
          }
        >
          {!groupOptions.includes(draft.groupBy) && (
            <option value={draft.groupBy} disabled>
              {GROUP_LABELS[draft.groupBy]} {translate("kpi.3594192b391d")}{" "}
            </option>
          )}
          {groupOptions.map((group) => (
            <option key={group} value={group}>
              {GROUP_LABELS[group]}
            </option>
          ))}
        </select>
      </label>
      <label>
        {" "}
        {translate("kpi.a6fc812e6cb4")}{" "}
        <select
          aria-label={translate("kpi.f5e5b2142ef7")}
          value={draft.statistic ?? ""}
          disabled={temporal || !choices.length}
          onChange={(e) => setDraft({ ...draft, statistic: e.target.value as Statistic })}
        >
          {!choices.length && <option value="">{translate("kpi.dae75cff3b98")}</option>}
          {choices.map((stat) => (
            <option key={stat} value={stat}>
              {STAT_LABELS[stat]}
            </option>
          ))}
        </select>
      </label>
      <p className="text-[11px] text-muted-foreground">
        {temporal
          ? translate("kpi.1d9357895475")
          : translate("kpi.4d2ab0d030a9", { v0: XY_UNAVAILABLE() })}
      </p>
      <div className="flex justify-end gap-2">
        <button type="button" className="kpi-button" onClick={onCancel}>
          {" "}
          {translate("kpi.46ad3916f6a0")}{" "}
        </button>
        <button
          type="submit"
          className="kpi-button primary"
          disabled={!temporal && !groupOptions.includes(draft.groupBy)}
        >
          {" "}
          {translate("kpi.b4c8b1dd7acd")}{" "}
        </button>
      </div>
    </form>
  );
}
