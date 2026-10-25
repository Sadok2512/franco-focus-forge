/** 2.0.0 — SA4 — Panneau de contrôle Site Layer sur carte.
 *
 * UI pliable (icône Layers) avec :
 *  - [ ] Show sites (master toggle)
 *  - Technos : 4G, 5G, LTE
 *  - Bands : B20, B3, B28, B1, B7, B8 (LTE) + n78, n28, n1, n3, n7, n75, n258 (NR)
 *  - Operators : ORF, BYT, SFR, FRM
 *
 * État persisté localStorage `bc4.map.sitesLayer.v3`. Vide = tous actifs.
 * 1.103.1 — enabled ON par défaut + bump v1→v2 pour reset auto.
 */
import { Antenna, Layers, MapPin, RadioTower, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SitesLayerFilters } from "./SitesLayer";

const STORAGE_KEY = "bc4.map.sitesLayer.v3";

type State = {
  enabled: boolean;
  cellsEnabled: boolean;
  filters: SitesLayerFilters;
};

const DEFAULT_STATE: State = {
  enabled: true,
  cellsEnabled: true,
  filters: { technos: [], bands: [], operators: [] },
};

const TECHNOS = ["4G", "5G", "LTE"] as const;
const BANDS_LTE = ["B20", "B28", "B8", "B3", "B1", "B7"] as const;
const BANDS_NR = ["n28", "n1", "n3", "n7", "n75", "n78", "n258"] as const;
const OPERATORS = [
  { v: "ORF", label: "Orange", color: "#FF7900" },
  { v: "BYT", label: "Bouygues", color: "#009FE3" },
  { v: "SFR", label: "SFR", color: "#E2001A" },
  { v: "FRM", label: "Free", color: "#16A34A" },
] as const;

export type SitesLayerControlsProps = {
  enabled: boolean;
  cellsEnabled: boolean;
  cellsAvailable: boolean;
  filters: SitesLayerFilters;
  onToggleEnabled: (v: boolean) => void;
  onToggleCells: (v: boolean) => void;
  onToggleTechno: (t: string) => void;
  onToggleBand: (b: string) => void;
  onToggleOperator: (o: string) => void;
  onReset?: () => void;
  status?: {
    loading: boolean;
    error: string | null;
    zoom?: number;
    n_sites?: number;
    n_cells?: number;
    n_returned?: number;
    n_total?: number;
    truncated?: boolean;
  };
};

function readState(): State {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<State>;
    return {
      enabled: Boolean(parsed.enabled),
      cellsEnabled: parsed.cellsEnabled !== false,
      filters: {
        technos: Array.isArray(parsed.filters?.technos) ? parsed.filters!.technos : [],
        bands: Array.isArray(parsed.filters?.bands) ? parsed.filters!.bands : [],
        operators: Array.isArray(parsed.filters?.operators) ? parsed.filters!.operators : [],
      },
    };
  } catch {
    return DEFAULT_STATE;
  }
}

function writeState(s: State) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore quota */
  }
}

export function useSitesLayerState() {
  const [state, setState] = useState<State>(() => readState());
  useEffect(() => writeState(state), [state]);
  return {
    enabled: state.enabled,
    cellsEnabled: state.cellsEnabled,
    filters: state.filters,
    setEnabled: (v: boolean) => setState((s) => ({ ...s, enabled: v })),
    setCellsEnabled: (v: boolean) => setState((s) => ({ ...s, cellsEnabled: v })),
    toggleTechno: (t: string) =>
      setState((s) => ({
        ...s,
        filters: {
          ...s.filters,
          technos: s.filters.technos.includes(t)
            ? s.filters.technos.filter((x) => x !== t)
            : [...s.filters.technos, t],
        },
      })),
    toggleBand: (b: string) =>
      setState((s) => ({
        ...s,
        filters: {
          ...s.filters,
          bands: s.filters.bands.includes(b)
            ? s.filters.bands.filter((x) => x !== b)
            : [...s.filters.bands, b],
        },
      })),
    toggleOperator: (o: string) =>
      setState((s) => ({
        ...s,
        filters: {
          ...s.filters,
          operators: s.filters.operators.includes(o)
            ? s.filters.operators.filter((x) => x !== o)
            : [...s.filters.operators, o],
        },
      })),
    reset: () => setState(DEFAULT_STATE),
  };
}

export function SitesLayerControls({
  enabled,
  cellsEnabled,
  cellsAvailable,
  filters,
  onToggleEnabled,
  onToggleCells,
  onToggleTechno,
  onToggleBand,
  onToggleOperator,
  status,
}: SitesLayerControlsProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const technoActive = (t: string) => filters.technos.length === 0 || filters.technos.includes(t);
  const bandActive = (b: string) => filters.bands.length === 0 || filters.bands.includes(b);
  const operatorActive = (o: string) =>
    filters.operators.length === 0 || filters.operators.includes(o);
  return (
    <div
      className="absolute right-2 top-20 z-10 rounded border border-[#E2E8F0] bg-white/95 text-[11px] shadow-sm"
      data-testid="sites-layer-controls"
    >
      <button
        type="button"
        className="flex items-center gap-1 px-2 py-1"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={t("mapSites.controls")}
      >
        <Layers size={14} />
        <span>{enabled ? t("mapSites.sitesOn") : t("mapSites.sitesOff")}</span>
        {status?.loading && (
          <span className="text-muted-foreground">· {t("mapSites.loading")}</span>
        )}
      </button>
      {open && (
        <div className="p-2 border-t border-[#E2E8F0] space-y-2 min-w-[200px]">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => onToggleEnabled(e.target.checked)}
            />
            <strong>{t("mapSites.showSites")}</strong>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={cellsEnabled}
              disabled={!cellsAvailable}
              onChange={(e) => onToggleCells(e.target.checked)}
            />
            <strong>
              {cellsAvailable ? t("mapSites.showCells") : t("mapSites.cellsFromZoom")}
            </strong>
          </label>
          {(enabled || cellsEnabled) && (
            <>
              <div>
                <div className="font-semibold mt-1">{t("mapSites.technology")}</div>
                <div className="flex gap-2 mt-1">
                  {TECHNOS.map((t) => (
                    <label key={t} className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={technoActive(t)}
                        onChange={() => onToggleTechno(t)}
                      />
                      <span>{t}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <div className="font-semibold mt-1">{t("mapSites.lteBands")}</div>
                <div className="flex gap-1 flex-wrap mt-1">
                  {BANDS_LTE.map((b) => (
                    <label key={b} className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={bandActive(b)}
                        onChange={() => onToggleBand(b)}
                      />
                      <span>{b}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <div className="font-semibold mt-1">{t("mapSites.nrBands")}</div>
                <div className="flex gap-1 flex-wrap mt-1">
                  {BANDS_NR.map((b) => (
                    <label key={b} className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={bandActive(b)}
                        onChange={() => onToggleBand(b)}
                      />
                      <span>{b}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <div className="font-semibold mt-1">{t("mapSites.operator")}</div>
                <div className="flex gap-2 mt-1 flex-wrap">
                  {OPERATORS.map((o) => (
                    <label key={o.v} className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={operatorActive(o.v)}
                        onChange={() => onToggleOperator(o.v)}
                      />
                      <span>{o.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              {status && !status.loading && status.n_returned != null && (
                <p
                  className={`text-[10px] mt-1 ${status.truncated ? "text-amber-700" : "text-muted-foreground"}`}
                  role={status.truncated ? "alert" : "status"}
                >
                  {status.n_returned.toLocaleString()}
                  {status.n_total != null ? ` / ${status.n_total.toLocaleString()}` : ""}
                  {status.truncated ? ` · ${t("mapSites.partial")}` : ""}
                </p>
              )}
              {status?.error && (
                <p className="text-[10px] mt-1 text-red-700" role="alert">
                  {t("mapSites.error")}: {status.error}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Full-map chrome inspired by GEOREF's FloatingTopToolbar/FloatingStatusBar.
 * It consumes the same layer state and API status as the compact control: no
 * second map implementation and no derived/fabricated population counters. */
export function SitesMapWorkspaceControls(props: SitesLayerControlsProps) {
  const { t, i18n } = useTranslation();
  const {
    enabled,
    cellsEnabled,
    cellsAvailable,
    filters,
    onToggleEnabled,
    onToggleCells,
    onToggleTechno,
    onToggleBand,
    onToggleOperator,
    onReset,
    status,
  } = props;
  const locale = i18n.resolvedLanguage === "fr" ? "fr-FR" : "en-GB";
  const active = (items: string[], value: string) => items.length === 0 || items.includes(value);
  const filterCount = filters.technos.length + filters.bands.length + filters.operators.length;

  return (
    <>
      <div className="pointer-events-none absolute left-14 right-14 top-3 z-20 flex justify-center">
        <div
          data-testid="map-workspace-topbar"
          className="pointer-events-auto flex max-w-full items-center gap-1.5 overflow-x-auto rounded-2xl border border-white/70 bg-white/80 p-1.5 shadow-lg backdrop-blur-md dark:border-slate-700 dark:bg-slate-950/80"
        >
          <span className="flex h-9 shrink-0 items-center gap-2 rounded-xl bg-slate-900 px-3 text-[11px] font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
            <RadioTower className="h-3.5 w-3.5" /> {t("mapWorkspace.networkMap")}
          </span>
          <button
            type="button"
            aria-pressed={enabled}
            onClick={() => onToggleEnabled(!enabled)}
            className={`flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[11px] font-semibold transition ${enabled ? "bg-sky-600 text-white" : "bg-muted text-muted-foreground"}`}
          >
            <MapPin className="h-3.5 w-3.5" /> {t("mapWorkspace.sites")}
          </button>
          <button
            type="button"
            aria-pressed={cellsEnabled}
            disabled={!cellsAvailable}
            title={!cellsAvailable ? t("mapSites.cellsFromZoom") : t("mapSites.showCells")}
            onClick={() => onToggleCells(!cellsEnabled)}
            className={`flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${cellsEnabled && cellsAvailable ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground"}`}
          >
            <Antenna className="h-3.5 w-3.5" /> {t("mapWorkspace.cells")}
          </button>
          <span className="mx-0.5 h-6 w-px shrink-0 bg-border" />
          <div
            className="flex shrink-0 overflow-hidden rounded-xl border bg-card"
            aria-label={t("mapSites.technology")}
          >
            {TECHNOS.map((techno) => (
              <button
                key={techno}
                type="button"
                aria-pressed={active(filters.technos, techno)}
                onClick={() => onToggleTechno(techno)}
                className={`h-9 border-r px-2.5 text-[10px] font-bold last:border-r-0 ${active(filters.technos, techno) ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              >
                {techno}
              </button>
            ))}
          </div>
          <details className="group relative shrink-0">
            <summary className="flex h-9 cursor-pointer list-none items-center rounded-xl border bg-card px-3 text-[11px] font-semibold hover:bg-muted">
              {t("mapWorkspace.bands")}{" "}
              {filters.bands.length ? `(${filters.bands.length})` : `(${t("common.all")})`}
            </summary>
            <div className="absolute left-0 top-11 z-30 w-64 rounded-xl border bg-popover p-3 shadow-xl">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t("mapSites.lteBands")}
              </p>
              <div className="mb-3 flex flex-wrap gap-1">
                {BANDS_LTE.map((band) => (
                  <FilterChip
                    key={band}
                    label={band}
                    pressed={active(filters.bands, band)}
                    onClick={() => onToggleBand(band)}
                  />
                ))}
              </div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t("mapSites.nrBands")}
              </p>
              <div className="flex flex-wrap gap-1">
                {BANDS_NR.map((band) => (
                  <FilterChip
                    key={band}
                    label={band}
                    pressed={active(filters.bands, band)}
                    onClick={() => onToggleBand(band)}
                  />
                ))}
              </div>
            </div>
          </details>
          <details className="group relative shrink-0">
            <summary className="flex h-9 cursor-pointer list-none items-center rounded-xl border bg-card px-3 text-[11px] font-semibold hover:bg-muted">
              {t("mapSites.operator")}{" "}
              {filters.operators.length ? `(${filters.operators.length})` : `(${t("common.all")})`}
            </summary>
            <div className="absolute right-0 top-11 z-30 w-44 rounded-xl border bg-popover p-2 shadow-xl">
              {OPERATORS.map((operator) => (
                <button
                  key={operator.v}
                  type="button"
                  onClick={() => onToggleOperator(operator.v)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs hover:bg-muted"
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: operator.color }}
                  />
                  <span className="flex-1">{operator.label}</span>
                  <span aria-hidden>{active(filters.operators, operator.v) ? "✓" : ""}</span>
                </button>
              ))}
            </div>
          </details>
          {filterCount > 0 && (
            <button
              type="button"
              onClick={onReset}
              title={t("common.reset")}
              aria-label={t("common.reset")}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border bg-card hover:bg-muted"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-4 left-1/2 z-20 max-w-[calc(100%-1rem)] -translate-x-1/2">
        <div
          data-testid="map-workspace-statusbar"
          className="pointer-events-auto flex items-center gap-3 overflow-x-auto whitespace-nowrap rounded-full border border-white/70 bg-white/80 px-4 py-2 text-[11px] shadow-lg backdrop-blur-md dark:border-slate-700 dark:bg-slate-950/80"
        >
          <StatusValue label={t("mapWorkspace.zoom")} value={(status?.zoom ?? 11).toFixed(1)} />
          <StatusValue
            label={t("mapWorkspace.visibleSites")}
            value={status?.n_sites == null ? "—" : status.n_sites.toLocaleString(locale)}
          />
          <StatusValue
            label={t("mapWorkspace.visibleCells")}
            value={status?.n_cells == null ? "—" : status.n_cells.toLocaleString(locale)}
          />
          <span
            className={`h-2 w-2 rounded-full ${status?.loading ? "animate-pulse bg-amber-500" : status?.error ? "bg-red-500" : "bg-emerald-500"}`}
          />
          <span
            className={status?.error ? "max-w-64 truncate text-red-700" : "text-muted-foreground"}
            {...(status?.error ? { title: status.error } : {})}
          >
            {status?.loading
              ? t("mapSites.loading")
              : status?.error
                ? `${t("mapSites.error")}: ${status.error}`
                : status?.truncated
                  ? t("mapSites.partial")
                  : t("mapWorkspace.ready")}
          </span>
        </div>
      </div>
    </>
  );
}

function FilterChip({
  label,
  pressed,
  onClick,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${pressed ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
    >
      {label}
    </button>
  );
}

function StatusValue({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-muted-foreground">{label}</span>
      <strong className="tabular-nums text-foreground">{value}</strong>
    </span>
  );
}
