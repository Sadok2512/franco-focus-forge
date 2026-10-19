import type { DictGeoFilters } from "@/lib/api/dict-v2";
import { GEO_KEYS, geoDraft, type GeoDraft } from "./geographic-state";
export type RrcFilterState = {
  techno: "LTE" | "NR" | "LTE+NR";
  message?: string;
  op: string[];
  band: string[];
  geography: GeoDraft;
};
const sorted = (values: readonly string[]) => [...new Set(values)].sort();
export function filterSnapshot(state: RrcFilterState): RrcFilterState {
  const op = sorted(state.op),
    band = sorted(state.band);
  const geography = Object.fromEntries(
    GEO_KEYS.map((key) => {
      const values = sorted(state.geography[key].values);
      Object.freeze(values);
      return [key, Object.freeze({ enabled: state.geography[key].enabled, values })];
    }),
  ) as GeoDraft;
  Object.freeze(op);
  Object.freeze(band);
  Object.freeze(geography);
  return Object.freeze({ techno: state.techno, message: state.message ?? "", op, band, geography });
}
export function defaultFilters(): RrcFilterState {
  return filterSnapshot({ techno: "LTE+NR", op: [], band: [], geography: geoDraft({}) });
}
export function geographicQuery(state: RrcFilterState): DictGeoFilters {
  return Object.fromEntries(
    GEO_KEYS.filter(
      (key) => state.geography[key].enabled && state.geography[key].values.length,
    ).map((key) => [key, state.geography[key].values]),
  );
}
export function appliedKey(state: RrcFilterState) {
  return JSON.stringify([
    state.techno,
    state.message ?? "",
    sorted(state.op),
    sorted(state.band),
    geographicQuery(state),
  ]);
}
export function draftKey(state: RrcFilterState) {
  return JSON.stringify(filterSnapshot(state));
}
