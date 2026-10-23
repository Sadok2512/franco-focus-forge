/** 2.0.0 — SA4 — Panneau de contrôle Site Layer sur carte.
 *
 * UI pliable (icône Layers) avec :
 *  - [ ] Show sites (master toggle)
 *  - Technos : 4G, 5G, LTE
 *  - Bands : B20, B3, B28, B1, B7, B8 (LTE) + n78, n28, n1, n3, n7, n75, n258 (NR)
 *  - Operators : ORF, BYT, SFR, FRM
 *
 * État persisté localStorage `bc4.map.sitesLayer.v1`. Vide = tous actifs.
 */
import { Layers } from "lucide-react";
import { useEffect, useState } from "react";
import type { SitesLayerFilters } from "./SitesLayer";

const STORAGE_KEY = "bc4.map.sitesLayer.v1";

type State = {
  enabled: boolean;
  filters: SitesLayerFilters;
};

const DEFAULT_STATE: State = {
  enabled: false,
  filters: { technos: [], bands: [], operators: [] },
};

const TECHNOS = ["4G", "5G", "LTE"] as const;
const BANDS_LTE = ["B20", "B28", "B8", "B3", "B1", "B7"] as const;
const BANDS_NR = ["n28", "n1", "n3", "n7", "n75", "n78", "n258"] as const;
const OPERATORS = [
  { v: "ORF", label: "Orange" },
  { v: "BYT", label: "Bouygues" },
  { v: "SFR", label: "SFR" },
  { v: "FRM", label: "Free" },
] as const;

function readState(): State {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<State>;
    return {
      enabled: Boolean(parsed.enabled),
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
    filters: state.filters,
    setEnabled: (v: boolean) => setState((s) => ({ ...s, enabled: v })),
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
  filters,
  onToggleEnabled,
  onToggleTechno,
  onToggleBand,
  onToggleOperator,
  status,
}: {
  enabled: boolean;
  filters: SitesLayerFilters;
  onToggleEnabled: (v: boolean) => void;
  onToggleTechno: (t: string) => void;
  onToggleBand: (b: string) => void;
  onToggleOperator: (o: string) => void;
  status?: { loading: boolean; error: string | null; n_returned?: number; n_total?: number; truncated?: boolean };
}) {
  const [open, setOpen] = useState(false);
  const technoActive = (t: string) => filters.technos.length === 0 || filters.technos.includes(t);
  const bandActive = (b: string) => filters.bands.length === 0 || filters.bands.includes(b);
  const operatorActive = (o: string) =>
    filters.operators.length === 0 || filters.operators.includes(o);
  return (
    <div
      className="absolute right-2 top-2 z-10 rounded border border-[#E2E8F0] bg-white/95 text-[11px] shadow-sm"
      data-testid="sites-layer-controls"
    >
      <button
        type="button"
        className="flex items-center gap-1 px-2 py-1"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Site layer controls"
      >
        <Layers size={14} />
        <span>{enabled ? "Sites ON" : "Sites OFF"}</span>
        {status?.loading && <span className="text-muted-foreground">· loading…</span>}
      </button>
      {open && (
        <div className="p-2 border-t border-[#E2E8F0] space-y-2 min-w-[200px]">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={enabled} onChange={(e) => onToggleEnabled(e.target.checked)} />
            <strong>Show sites on map</strong>
          </label>
          {enabled && (
            <>
              <div>
                <div className="font-semibold mt-1">Techno</div>
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
                <div className="font-semibold mt-1">LTE bands</div>
                <div className="flex gap-1 flex-wrap mt-1">
                  {BANDS_LTE.map((b) => (
                    <label key={b} className="flex items-center gap-1">
                      <input type="checkbox" checked={bandActive(b)} onChange={() => onToggleBand(b)} />
                      <span>{b}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <div className="font-semibold mt-1">NR bands</div>
                <div className="flex gap-1 flex-wrap mt-1">
                  {BANDS_NR.map((b) => (
                    <label key={b} className="flex items-center gap-1">
                      <input type="checkbox" checked={bandActive(b)} onChange={() => onToggleBand(b)} />
                      <span>{b}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <div className="font-semibold mt-1">Operator</div>
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
                  {status.n_returned.toLocaleString()} / {status.n_total?.toLocaleString() ?? "?"}
                  {status.truncated ? " · zoom in to see all" : ""}
                </p>
              )}
              {status?.error && (
                <p className="text-[10px] mt-1 text-red-700" role="alert">
                  Error: {status.error}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
