import { useState } from "react";
import { Check, ChevronDown, MapPin, RotateCcw, SlidersHorizontal } from "lucide-react";
import { FilterSelect } from "@/features/dict-v2/FilterSelect";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ProjectKpiFilters, KpiQueryFilters } from "@/lib/api/project-kpi-schemas";
import {
  ADVANCED_DIMS,
  FILTER_DIMS,
  GEO_DIMS,
  type FilterDraft,
  type FilterKey,
} from "./workspace-model";

const VISIBLE_GEO_DIMS = GEO_DIMS.filter((dim) => dim.key !== "commune" && dim.key !== "insee");

export function KpiFilters({
  draft,
  applied,
  dimensions,
  period,
  dirty,
  loading,
  error,
  onRetry,
  onChange,
  onApply,
  onReset,
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
}) {
  const [advanced, setAdvanced] = useState(false);
  const update = (key: FilterKey, values: string[]) =>
    onChange({ ...draft, values: { ...draft.values, [key]: values } });
  const select = (
    key: FilterKey,
    source: (typeof FILTER_DIMS)[number]["source"],
    label: string,
  ) => {
    const dim = dimensions?.[source];
    if (!dim || typeof dim !== "object" || !("available" in dim) || !dim.available)
      return (
        <span
          className="kpi-unavailable-filter"
          title={
            typeof dim === "object" && dim && "reason" in dim
              ? String(dim.reason ?? "Indisponible")
              : "Dimension non prise en charge"
          }
        >
          {label} · Indisponible
        </span>
      );
    return (
      <FilterSelect
        label={label}
        showLabel
        operatorBadges={key === "operator"}
        options={Array.isArray(dim.values) ? (dim.values as string[]) : []}
        value={draft.values[key] ?? []}
        onChange={(v) => update(key, v)}
      />
    );
  };
  const rats = dimensions?.rats?.values ?? [];
  const activeGeo = VISIBLE_GEO_DIMS.filter((d) => draft.enabledGeo.includes(d.key));
  const advancedSupported = ADVANCED_DIMS.filter((d) => dimensions?.[d.source]?.available);
  return (
    <section className="kpi-filterbar" aria-label="Filtres KPI">
      <div className="kpi-filter-actions">
        <SlidersHorizontal size={15} className="text-primary" />
        <h2 className="text-xs font-semibold">Filtres d’analyse</h2>
        {dirty && (
          <span role="status" className="kpi-dirty">
            Modifications non appliquées
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button className="kpi-button" onClick={onReset}>
            <RotateCcw size={13} />
            Réinitialiser
          </button>
          <button
            className="kpi-button primary"
            disabled={loading || error || !dirty}
            onClick={onApply}
          >
            <Check size={14} />
            Appliquer les filtres
          </button>
        </div>
      </div>
      <div id="kpi-filter-controls" className="kpi-filter-controls">
        {error && (
          <div role="alert" className="text-xs text-destructive">
            Les dimensions du projet n’ont pas pu être chargées.{" "}
            <button className="underline" onClick={onRetry}>
              Réessayer
            </button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <div className="kpi-tech-filter" role="group" aria-label="Technologie">
            {[
              { label: "LTE", values: ["LTE"] },
              { label: "NR", values: ["NR"] },
              { label: "LTE + NR", values: ["LTE", "NR"] },
            ].map((option) => {
              const values = draft.values.rat ?? [];
              const selected =
                option.values.length === 2
                  ? !values.length || (values.includes("LTE") && values.includes("NR"))
                  : values.length === 1 && values[0] === option.values[0];
              return (
                <button
                  key={option.label}
                  aria-pressed={selected}
                  disabled={
                    loading ||
                    !dimensions?.rats?.available ||
                    !option.values.every((v) => rats.includes(v))
                  }
                  onClick={() => update("rat", option.values)}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          {select("operator", "operators", "Opérateur")}
          {select("band", "bands", "Bande")}
          <Popover>
            <PopoverTrigger asChild>
              <button className="kpi-button">
                <MapPin size={14} />
                Zone géographique
                {activeGeo.length > 0 && <span className="kpi-count">{activeGeo.length}</span>}
                <ChevronDown size={13} />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-80 max-w-[calc(100vw-32px)] p-3" align="start">
              <h3 className="font-semibold text-sm mb-3">Dimensions géographiques</h3>
              <div className="space-y-3">
                {VISIBLE_GEO_DIMS.map((dim) => {
                  const supported = dimensions?.[dim.source];
                  const enabled = draft.enabledGeo.includes(dim.key);
                  return (
                    <div key={dim.key}>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          role="switch"
                          type="checkbox"
                          aria-label={`Activer ${dim.label}`}
                          disabled={!supported?.available}
                          checked={enabled && Boolean(supported?.available)}
                          onChange={(e) =>
                            onChange({
                              ...draft,
                              enabledGeo: e.target.checked
                                ? [...draft.enabledGeo, dim.key]
                                : draft.enabledGeo.filter((k) => k !== dim.key),
                            })
                          }
                        />
                        <span>{dim.label}</span>
                        <span className="ml-auto text-xs text-muted-foreground">
                          {supported?.values?.length ?? 0}
                        </span>
                      </label>
                      {!supported?.available && (
                        <p className="mt-1 ml-5 text-[11px] text-muted-foreground">
                          {supported?.reason ?? "Dimension non prise en charge pour ce projet."}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
          {activeGeo.map((dim) => (
            <div key={dim.key}>{select(dim.key, dim.source, dim.label)}</div>
          ))}
          <span
            className="kpi-unavailable-filter"
            title="Le contrat KPI ne prend pas en charge le filtrage par dates."
          >
            Période : {period ?? "—"}
          </span>
          {advancedSupported.length > 0 && (
            <Popover open={advanced} onOpenChange={setAdvanced}>
              <PopoverTrigger asChild>
                <button className="kpi-button" aria-expanded={advanced}>
                  <SlidersHorizontal size={14} /> Filtres avancés
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-80 max-w-[calc(100vw-32px)] p-3" align="end">
                <div className="flex flex-wrap gap-2" aria-label="Filtres avancés">
                  {advancedSupported.map((dim) => (
                    <div key={dim.key}>{select(dim.key, dim.source, dim.label)}</div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>
      {FILTER_DIMS.some((dim) => dim.key !== "operator" && applied[dim.key]?.length) && (
        <div className="kpi-applied-chips" aria-label="Filtres appliqués">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Appliqués
          </span>
          {FILTER_DIMS.filter((dim) => dim.key !== "operator").flatMap((dim) =>
            (applied[dim.key] ?? []).map((value) => (
              <span
                className="kpi-filter-chip inline-flex items-center gap-1"
                key={`${dim.key}:${value}`}
              >
                {dim.label} : {value}
              </span>
            )),
          )}
          {!FILTER_DIMS.some((dim) => applied[dim.key]?.length) && (
            <span className="text-xs text-muted-foreground">Toute la population du projet</span>
          )}
        </div>
      )}
    </section>
  );
}
