import type {
  DictDistributionResponse,
  DistributionValueGroup,
  GroupByMode,
} from "@/lib/api/dict-v2";
import { groupKeyLabel } from "./types";

/** Project only API aggregates; keep evidence fields intact. Callers hide project-wide verdicts when filtered. */
export function filterDistribution(
  data: DictDistributionResponse | null,
  op: string[],
  band: string[],
  groupBy: GroupByMode,
): DictDistributionResponse | null {
  if (!data || (!op.length && !band.length && data.group_by === groupBy)) return data;
  return {
    ...data,
    group_by: groupBy,
    blocks: data.blocks.map((block) => {
      const values = block.values
        .map((value) => {
          const grouped = new Map<string, DistributionValueGroup>();
          for (const group of value.groups) {
            if (op.length && !op.includes(group.operator ?? "N/D")) continue;
            if (band.length && !band.includes(group.band ?? "N/D")) continue;
            const key = groupKeyLabel(groupBy, group);
            const previous = grouped.get(key);
            grouped.set(key, { ...group, n: (previous?.n ?? 0) + group.n });
          }
          return { ...value, groups: [...grouped.values()] };
        })
        .filter((value) => value.groups.length > 0);
      return {
        ...block,
        values,
        n_total:
          !op.length && !band.length
            ? block.n_total
            : values.reduce(
                (total, value) => total + value.groups.reduce((n, group) => n + group.n, 0),
                0,
              ),
        distinct_values: !op.length && !band.length ? block.distinct_values : values.length,
      };
    }),
  };
}
