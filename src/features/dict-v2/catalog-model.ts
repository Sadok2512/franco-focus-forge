import type { DictLeaf, DictTreeResponse, DictParameterNode } from "@/lib/api/dict-v2";

/** Metadata projection only: each key and population is supplied by the API. */
export function catalogParameters(tree: DictTreeResponse | null) {
  return (tree?.tree ?? []).flatMap((t) =>
    t.origins.flatMap((o) =>
      (o.categories ?? []).flatMap((c) =>
        c.subcategories.flatMap((sub) =>
          sub.parameters.map((p) => ({
            technology: t.techno,
            origin: o.origin,
            category: c,
            subcategory: sub,
            parameter: p,
          })),
        ),
      ),
    ),
  );
}
export function catalogSelection(node: DictLeaf, technology: string, origin: string): DictLeaf {
  return {
    ...node,
    technology,
    origin: origin as DictLeaf["origin"],
    selection_id: node.param_key,
  };
}
/** Parent selections use the server's aggregate key, never a client sum of children. */
export function toggleCatalogSelection(
  previous: DictLeaf[],
  parameter: DictParameterNode,
  technology: string,
  origin: string,
  leaf?: DictLeaf,
  aggregate = true,
): DictLeaf[] {
  const keys = new Set([parameter.param_key, ...parameter.leaves.map((l) => l.param_key)]);
  const outside = previous.filter((p) => !keys.has(p.param_key));
  const parentChecked = previous.some((p) => p.param_key === parameter.param_key);
  const checked = (p: DictLeaf) =>
    parentChecked || previous.some((s) => s.param_key === p.param_key);
  if (!leaf) {
    return parentChecked || (parameter.leaves.length > 0 && parameter.leaves.every(checked))
      ? outside
      : [
          ...outside,
          ...(aggregate
            ? [catalogSelection(parameter, technology, origin)]
            : parameter.leaves.map((l) => catalogSelection(l, technology, origin))),
        ];
  }
  const chosen = parameter.leaves.filter((p) =>
    p.param_key === leaf.param_key ? !checked(p) : checked(p),
  );
  return [...outside, ...chosen.map((p) => catalogSelection(p, technology, origin))];
}
export function messageAbbreviation(message: string): string {
  const sib = message.match(/(?:SystemInformationBlockType|SIB)\s*(\d+)/i);
  if (sib) return `SIB${sib[1]}`;
  return (
    (
      {
        MasterInformationBlock: "MIB",
        RRCConnectionReconfiguration: "RRCReconf",
        RRCConnectionRelease: "RRCRel",
        RRCConnectionSetup: "RRCSetup",
        RRCConnectionRequest: "RRCReq",
        MeasurementReport: "MeasReport",
        UECapabilityInformation: "UECapInfo",
        UECapabilityEnquiry: "UECapEnq",
      } as Record<string, string>
    )[message] ?? message
  );
}

/** Compatibility metadata for existing right-hand panels; not a rendered message tree. */
export function catalogMetadata(tree: DictTreeResponse | null): DictTreeResponse | null {
  if (!tree) return null;
  return {
    ...tree,
    tree: tree.tree.map((t) => ({
      ...t,
      origins: t.origins.map((o) => ({
        ...o,
        messages: o.categories?.length
          ? [
              {
                message: "",
                groups: o.categories.map((c) => ({
                  name: c.label,
                  id: c.id,
                  kpis: c.subcategories.flatMap((sub) =>
                    sub.parameters.flatMap((p) => [
                      catalogSelection(p, t.techno, o.origin),
                      ...p.leaves.map((l) => catalogSelection(l, t.techno, o.origin)),
                    ]),
                  ),
                })),
              },
            ]
          : o.messages,
      })),
    })),
  };
}
