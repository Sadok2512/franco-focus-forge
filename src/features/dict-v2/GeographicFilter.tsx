import { ChevronDown, LoaderCircle, MapPin } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { DictGeographicDimension } from "@/lib/api/dict-v2";
import { GEO_KEYS, GEO_LABELS, type GeoDraft } from "./geographic-state";
import { FilterSelect } from "./FilterSelect";

export function GeographicFilter({
  dimensions,
  draft,
  onChange,
  loading,
  error,
  showActiveFilters = true,
  showLabel = false,
}: {
  dimensions: DictGeographicDimension[];
  draft: GeoDraft;
  onChange: (draft: GeoDraft) => void;
  loading: boolean;
  error: boolean;
  showActiveFilters?: boolean;
  showLabel?: boolean;
}) {
  const count = GEO_KEYS.reduce(
    (sum, key) => sum + (draft[key].enabled ? draft[key].values.length : 0),
    0,
  );
  const summary = count ? `${count} valeur${count > 1 ? "s" : ""}` : "Toutes";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <button className="rrc-control" aria-label={`Zone géographique — ${summary}`}>
            {showLabel && (
              <>
                <MapPin size={14} aria-hidden="true" />
                Zone géographique
              </>
            )}
            {(!showLabel || count > 0) && summary} <ChevronDown size={14} aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          aria-label="Filtres géographiques"
          className="rrc-premium-popover w-80 max-w-[calc(100vw-32px)] p-3"
        >
          <div className="mb-3 flex items-center gap-2">
            <h3 className="flex-1 text-sm font-semibold">Dimensions géographiques</h3>
            {loading && (
              <LoaderCircle
                size={15}
                className="animate-spin text-muted-foreground"
                aria-label="Chargement"
              />
            )}
            {count > 0 && (
              <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">
                {count}
              </span>
            )}
          </div>
          <div className="space-y-3">
            {GEO_KEYS.map((key) => {
              const dimension = dimensions.find((d) => d.key === key);
              const available = !loading && !error && (dimension?.available ?? false);
              const state = draft[key];
              return (
                <div key={key}>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      role="switch"
                      aria-label={`Activer ${GEO_LABELS[key]}`}
                      disabled={!available}
                      checked={available && state.enabled}
                      onChange={(event) =>
                        onChange({
                          ...draft,
                          [key]: { ...state, enabled: event.target.checked },
                        })
                      }
                    />
                    <span className={available ? "" : "text-muted-foreground"}>
                      {GEO_LABELS[key]}
                    </span>
                    {!available && (
                      <span
                        className="text-xs text-muted-foreground"
                        title={dimension?.reason ?? "Dimension indisponible"}
                      >
                        Indisponible
                      </span>
                    )}
                    <span
                      className="ml-auto text-xs tabular-nums text-muted-foreground"
                      aria-label={`${dimension?.count ?? 0} options`}
                    >
                      {dimension?.count ?? 0}
                    </span>
                  </label>
                  {state.values.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1">
                      {state.values.map((value) => (
                        <button
                          key={value}
                          className="rrc-chip"
                          aria-label={`Effacer ${GEO_LABELS[key]} ${value}`}
                          onClick={() =>
                            onChange({
                              ...draft,
                              [key]: { ...state, values: state.values.filter((v) => v !== value) },
                            })
                          }
                        >
                          {value} ×
                        </button>
                      ))}
                      <button
                        className="rounded px-2 py-1 text-xs text-primary"
                        onClick={() => onChange({ ...draft, [key]: { ...state, values: [] } })}
                      >
                        Effacer la sélection
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
      {showActiveFilters && (
        <ActiveGeographicFilters
          dimensions={dimensions}
          draft={draft}
          onChange={onChange}
          loading={loading}
          error={error}
        />
      )}
    </div>
  );
}

export function ActiveGeographicFilters({
  dimensions,
  draft,
  onChange,
  loading,
  error,
}: {
  dimensions: DictGeographicDimension[];
  draft: GeoDraft;
  onChange: (draft: GeoDraft) => void;
  loading: boolean;
  error: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {GEO_KEYS.map((key) => {
        const dimension = dimensions.find((d) => d.key === key);
        const state = draft[key];
        if (loading || error || !dimension?.available || !state.enabled) return null;
        return (
          <FilterSelect
            key={key}
            showLabel
            label={GEO_LABELS[key]}
            options={dimension.options}
            value={state.values}
            onChange={(values) => onChange({ ...draft, [key]: { ...state, values } })}
          />
        );
      })}
    </div>
  );
}
