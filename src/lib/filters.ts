import { useNavigate, useSearch } from "@tanstack/react-router";
import { FilterContextSchema, type FilterContext } from "./api/schemas";

export const validateFilters = (s: Record<string, unknown>): FilterContext => {
  const r = FilterContextSchema.safeParse(s);
  return r.success ? r.data : {};
};

/** Shared filter state, persisted in the URL so it survives navigation and can be shared. */
export function useFilters() {
  const search = useSearch({ strict: false }) as FilterContext;
  const navigate = useNavigate();
  const set = (patch: Partial<FilterContext>) =>
    navigate({
      to: ".",
      search: (prev: FilterContext) => {
        const next = { ...prev, ...patch };
        for (const k of Object.keys(next) as (keyof FilterContext)[]) {
          const v = next[k];
          if (v === undefined || (Array.isArray(v) && v.length === 0)) delete next[k];
        }
        return next;
      },
      replace: true,
    } as never);
  return { filters: search, set };
}
