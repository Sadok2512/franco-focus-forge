import type { DictTreeResponse } from "@/lib/api/dict-v2";
import type { TemplateCategory } from "@/lib/api/dict-templates";
export function categoryTree(tree: DictTreeResponse | null, category: TemplateCategory | null) {
  if (!tree || !category) return tree;
  return {
    ...tree,
    distinct_param_keys: category.n_parameters,
    total_rows: category.n_in_project,
    tree: tree.tree
      .map((t) => ({
        ...t,
        origins: t.origins
          .map((o) => ({
            ...o,
            messages: o.messages
              .map((m) => ({
                ...m,
                groups: m.groups
                  .map((g) => ({
                    ...g,
                    kpis: g.kpis.filter((k) => k["category_id"] === category.id),
                  }))
                  .filter((g) => g.kpis.length),
              }))
              .filter((m) => m.groups.length),
          }))
          .filter((o) => o.messages.length),
      }))
      .filter((t) => t.origins.length),
  };
}
export function templateLeaves(tree: DictTreeResponse | null, category: TemplateCategory) {
  const refs = category.entries.flatMap((e) => e.parameters);
  return (tree?.tree ?? []).flatMap((t) =>
    t.origins.flatMap((o) =>
      o.messages.flatMap((m) =>
        m.groups.flatMap((g) =>
          g.kpis.filter((k) =>
            refs.some(
              (r) =>
                r.technology === t.techno &&
                r.param_key === k.param_key &&
                Object.entries(r.discriminators).every(
                  ([key, value]) => k.discriminators?.[key] === value,
                ),
            ),
          ),
        ),
      ),
    ),
  );
}
