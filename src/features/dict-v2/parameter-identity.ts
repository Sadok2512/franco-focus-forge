import type { DictLeaf, DictTreeResponse } from "@/lib/api/dict-v2";
export const selectionId = (leaf: DictLeaf) =>
  typeof leaf["selection_id"] === "string" ? leaf["selection_id"] : leaf.param_key;
const segments = (path: string) => path.split("/").filter((segment) => !/^\[\d+\]$/.test(segment));
/** Match the complete catalog path in order, never a display-name lookup or a guessed CHOICE catalog. */
function projectsTo(raw: string, canonical: string) {
  const source = segments(raw),
    target = segments(canonical);
  if (source[0] !== target[0] || source.at(-1) !== target.at(-1)) return false;
  let i = 0;
  for (const segment of source) if (segment === target[i]) i++;
  return i === target.length;
}
export function identifyTrees(catalog: DictTreeResponse | null, raw: DictTreeResponse | null) {
  const entries: Array<{ leaf: DictLeaf; technology: string; message: string }> = [];
  for (const t of catalog?.tree ?? [])
    for (const o of t.origins)
      for (const m of o.messages)
        for (const g of m.groups)
          for (const leaf of g.kpis)
            entries.push({ leaf, technology: t.techno, message: m.message });
  const index = new Map<string, typeof entries>();
  for (const entry of entries) {
    const key = JSON.stringify([
      entry.technology,
      entry.message,
      entry.leaf.param_key.split("/").at(-1),
    ]);
    const bucket = index.get(key) ?? [];
    bucket.push(entry);
    index.set(key, bucket);
  }
  function annotate(tree: DictTreeResponse | null) {
    if (!tree) return null;
    return {
      ...tree,
      tree: tree.tree.map((t) => ({
        ...t,
        origins: t.origins.map((o) => ({
          ...o,
          messages: o.messages.map((m) => ({
            ...m,
            groups: m.groups.map((g) => ({
              ...g,
              kpis: g.kpis.map((leaf) => {
                const candidates =
                  tree.view === "catalog"
                    ? [{ leaf, technology: t.techno, message: m.message }]
                    : (
                        index.get(
                          JSON.stringify([t.techno, m.message, leaf.param_key.split("/").at(-1)]),
                        ) ?? []
                      ).filter((e) => projectsTo(leaf.param_key, e.leaf.param_key));
                const unique = new Map(candidates.map((e) => [e.leaf.param_key, e.leaf]));
                const match = unique.size === 1 ? [...unique.values()][0]! : null;
                const key = match?.param_key ?? leaf.param_key;
                return {
                  ...leaf,
                  technology: t.techno,
                  message_id: m.message,
                  asn1_path: leaf.param_key,
                  selection_id: JSON.stringify([t.techno, m.message, key]),
                  distribution_key: match?.param_key ?? null,
                  canonical_n: match?.n ?? null,
                  canonical_name: match?.display_name ?? null,
                  mapping_error: match
                    ? null
                    : "Aucune correspondance canonique unique dans le catalogue pour ce chemin ASN.1. Distribution non demandée.",
                };
              }),
            })),
          })),
        })),
      })),
    };
  }
  return { catalog: annotate(catalog), raw: annotate(raw) };
}
export function selectedParameter(leaf: DictLeaf): DictLeaf {
  return {
    ...leaf,
    param_key:
      typeof leaf["distribution_key"] === "string" ? leaf["distribution_key"] : leaf.param_key,
    display_name:
      typeof leaf["canonical_name"] === "string" ? leaf["canonical_name"] : leaf.display_name,
    n: typeof leaf["canonical_n"] === "number" ? leaf["canonical_n"] : leaf.n,
  };
}

export function withDisplayedCounts(
  tree: DictTreeResponse | null,
  counts: ReadonlyMap<string, number | null>,
): DictTreeResponse | null {
  if (!tree) return null;
  return {
    ...tree,
    tree: tree.tree.map((t) => ({
      ...t,
      origins: t.origins.map((o) => ({
        ...o,
        messages: o.messages.map((m) => ({
          ...m,
          groups: m.groups.map((g) => ({
            ...g,
            kpis: g.kpis.map((leaf) => ({ ...leaf, displayed_n: counts.get(selectionId(leaf)) })),
          })),
        })),
      })),
    })),
  };
}
