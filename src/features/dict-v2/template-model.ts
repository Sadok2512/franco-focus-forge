import { catalogParameters, catalogSelection } from "./catalog-model";
import type { DictLeaf, DictTreeResponse } from "@/lib/api/dict-v2";
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
  const parameters = catalogParameters(tree);
  if (parameters.length)
    return parameters.flatMap((item) =>
      item.parameter.leaves
        .filter((leaf) =>
          refs.some(
            (ref) =>
              ref.technology === item.technology &&
              (ref.param_key === leaf.param_key ||
                leaf.source_param_keys.includes(ref.param_key)) &&
              Object.entries(ref.discriminators).every(
                ([key, value]) => leaf.discriminators?.[key] === value,
              ),
          ),
        )
        .map((leaf) => catalogSelection(leaf, item.technology, item.origin)),
    );
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

export type TemplateRow = {
  id: string;
  label: string;
  n: number | null;
  message: string | null;
  discriminators: Record<string, unknown>;
  leaf: DictLeaf | null;
};

/** Resolve only server references. Missing references remain visible without invented counts. */
export function templateRows(
  tree: DictTreeResponse | null,
  category: TemplateCategory,
  technology: string,
) {
  const catalog = catalogParameters(tree).filter((p) => p.technology === technology);
  return category.entries
    .filter((entry) => entry.technology === technology)
    .flatMap<TemplateRow>((entry) => {
      const references = entry.parameters.filter((r) => r.technology === technology);
      if (!references.length)
        return [
          {
            id: entry.id,
            label: entry.label,
            n: entry.n_in_project,
            message: null,
            discriminators: entry.discriminators,
            leaf: null,
          },
        ];
      return references.flatMap<TemplateRow>((ref) => {
        const matches = catalog.flatMap((p) =>
          p.parameter.leaves
            .filter(
              (leaf) =>
                [leaf.param_key, ...leaf.source_param_keys].some(
                  (key) =>
                    key === ref.param_key || (ref.path_prefix && key.startsWith(ref.path_prefix)),
                ) &&
                Object.entries(ref.discriminators).every(
                  ([key, value]) => leaf.discriminators?.[key] === value,
                ),
            )
            .map((leaf) => ({
              id: `${entry.id}:${leaf.param_key}`,
              label: p.parameter.display_name,
              n: leaf.n,
              message: leaf.message,
              discriminators: leaf.discriminators ?? {},
              leaf: catalogSelection(leaf, technology, p.origin),
            })),
        );
        return matches.length
          ? matches
          : [
              {
                id: `${entry.id}:${ref.param_key}`,
                label: ref.param_key.split("/").at(-1) || entry.label,
                n: entry.n_in_project === 0 ? 0 : null,
                message: null,
                discriminators: ref.discriminators,
                leaf: null,
              },
            ];
      });
    })
    .filter((row, index, rows) => rows.findIndex((other) => other.id === row.id) === index);
}
