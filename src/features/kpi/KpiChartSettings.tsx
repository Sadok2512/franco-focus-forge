import { useState } from "react";
import type { KpiGroupBy } from "@/lib/api/project-kpi-schemas";
import { GROUP_LABELS, XY_UNAVAILABLE, type ChartConfig } from "./visualization-model";
import { STAT_LABELS, type Statistic } from "./workspace-model";

export function KpiChartSettings({
  config,
  name,
  unit,
  groupOptions,
  choices,
  onApply,
  onCancel,
}: {
  config: ChartConfig;
  name: string;
  unit: string | null;
  groupOptions: KpiGroupBy[];
  choices: Statistic[];
  onApply: (next: ChartConfig) => void;
  onCancel: () => void;
}) {
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
      <h4 className="font-semibold text-sm">Paramètres du graphique</h4>
      <p className="text-xs text-muted-foreground truncate" title={name}>
        {name}
      </p>
      <label>
        Axe X
        <select
          aria-label="Axe X"
          value={draft.xMetric}
          onChange={(e) =>
            setDraft({
              ...draft,
              xMetric: e.target.value as KpiGroupBy,
              groupBy: e.target.value as KpiGroupBy,
            })
          }
        >
          {!groupOptions.includes(draft.xMetric) && (
            <option value={draft.xMetric} disabled>
              {GROUP_LABELS[draft.xMetric]} — indisponible
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
        Axe Y
        <select aria-label="Axe Y" value={draft.yMetric} disabled>
          <option value={config.kpiCode}>
            {name} · {unit ?? "Unité non renseignée"}
          </option>
        </select>
      </label>
      <label>
        Regrouper par
        <select
          aria-label="Regroupement du graphique"
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
              {GROUP_LABELS[draft.groupBy]} — indisponible
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
        Statistique
        <select
          aria-label="Statistique du graphique"
          value={draft.statistic ?? ""}
          disabled={!choices.length}
          onChange={(e) => setDraft({ ...draft, statistic: e.target.value as Statistic })}
        >
          {!choices.length && <option value="">Indisponible</option>}
          {choices.map((stat) => (
            <option key={stat} value={stat}>
              {STAT_LABELS[stat]}
            </option>
          ))}
        </select>
      </label>
      <p className="text-[11px] text-muted-foreground">
        {XY_UNAVAILABLE} L’axe Y reste le KPI sélectionné.
      </p>
      <div className="flex justify-end gap-2">
        <button type="button" className="kpi-button" onClick={onCancel}>
          Annuler
        </button>
        <button
          type="submit"
          className="kpi-button primary"
          disabled={!groupOptions.includes(draft.groupBy)}
        >
          Appliquer
        </button>
      </div>
    </form>
  );
}
