import { catalogMetadata } from "./catalog-model";
import type {
  DictTreeResponse,
  DistributionBlock,
  DistributionValueGroup,
  GroupByMode,
} from "@/lib/api/dict-v2";
import { groupKeyColor, groupKeyLabel } from "./types";

export type Cell = { count: number | null; denominator: number | null; percentage: number | null };
export type Column = {
  id: string;
  label: string;
  operator: string | null;
  band: string | null;
  color: string;
};
/** Presentation only: the v2 contract represents unattributed operators as null.
 * Band-only columns have no operator dimension and must remain visible.
 * Do not classify arbitrary operator names (including unfamiliar strings).
 */
export function attributedTableColumns(columns: Column[], mode: GroupByMode): Column[] {
  return mode === "band" ? columns : columns.filter((column) => column.operator !== null);
}

export type ValueRow = {
  id: string;
  familyId: string;
  family: string;
  parameterId: string;
  parameterKey: string;
  technology: string | null;
  asn1Path: string;
  parameter: string;
  value: string;
  rawValue: string;
  cells: Record<string, Cell>;
  total: number | null;
};
export type TableSort = { key: string; desc: boolean; metric?: "count" | "percentage" };
const compare = (a: string, b: string) => a.localeCompare(b, "fr", { numeric: true });
export function buildGroupedTable(
  blocks: DistributionBlock[],
  mode: GroupByMode,
  catalog?: DictTreeResponse | null,
) {
  const technologies = new Map<string, Set<string>>();
  const families = new Map<string, Map<string, string>>();
  for (const tech of catalogMetadata(catalog ?? null)?.tree ?? [])
    for (const origin of tech.origins)
      for (const message of origin.messages)
        for (const group of message.groups) {
          // The catalog's category name is its only declared family identifier.
          const id =
            typeof group["family_id"] === "string"
              ? group["family_id"]
              : typeof group["id"] === "string"
                ? group["id"]
                : `catalog:${JSON.stringify(group.name)}`;
          for (const leaf of group.kpis) {
            const techs = technologies.get(leaf.param_key) ?? new Set<string>();
            techs.add(tech.techno);
            technologies.set(leaf.param_key, techs);
            const membership = families.get(leaf.param_key) ?? new Map<string, string>();
            membership.set(id, group.name);
            families.set(leaf.param_key, membership);
          }
        }
  const columns = new Map<string, Column>();
  const key = (g: DistributionValueGroup) =>
    JSON.stringify([
      mode,
      mode === "band" ? null : (g.operator ?? null),
      mode === "operator" ? null : (g.band ?? null),
    ]);
  for (const block of blocks)
    for (const value of block.values)
      for (const g of value.groups) {
        const id = key(g);
        columns.set(id, {
          id,
          label: groupKeyLabel(mode, g),
          operator: mode === "band" ? null : (g.operator ?? null),
          band: mode === "operator" ? null : (g.band ?? null),
          color: groupKeyColor(mode, g),
        });
      }
  const rows: ValueRow[] = [];
  const diagnostics: string[] = [];
  for (const block of blocks) {
    const knownTech = technologies.get(block.param_key);
    const technology =
      typeof block["technology"] === "string"
        ? block["technology"]
        : knownTech?.size === 1
          ? [...knownTech][0]!
          : null;
    const parameterId = typeof block["param_id"] === "string" ? block["param_id"] : block.param_key;
    // Dict v2 param_key is the canonical ASN.1 path, not the display name.
    const asn1Path = typeof block["asn1_path"] === "string" ? block["asn1_path"] : block.param_key;
    const parameterKey = JSON.stringify([technology, parameterId, asn1Path]);
    const membership = families.get(block.param_key);
    const [familyId, family] =
      membership?.size === 1 ? [...membership][0]! : ["unknown", "Famille non renseignée"];
    const seen = new Map<string, number>();
    block.values.forEach((value) => {
      const occurrence = seen.get(value.value) ?? 0;
      seen.set(value.value, occurrence + 1);
      if (occurrence === 1)
        diagnostics.push(
          `${block.display_name} (${block.param_key}) : valeur brute dupliquée ${value.value}. Les lignes sources sont conservées.`,
        );
      const counts = new Map<string, number>();
      for (const g of value.groups) if (g.n != null) counts.set(key(g), g.n);
      const cells: Record<string, Cell> = {};
      for (const id of columns.keys()) {
        cells[id] = {
          count: counts.get(id) ?? null,
          denominator: null,
          percentage: null,
        };
      }
      rows.push({
        id: JSON.stringify([parameterKey, value.value, occurrence]),
        familyId,
        family,
        parameterId,
        parameterKey,
        technology,
        asn1Path,
        parameter: block.display_name,
        value: value.value_display,
        rawValue: value.value,
        cells,
        total: null,
      });
    });
  }
  const operatorOrder = ["Orange", "SFR", "Bouygues", "Free"];
  const rank = (c: Column) => {
    const i = operatorOrder.indexOf(c.operator ?? "");
    return i < 0 ? operatorOrder.length : i;
  };
  return {
    rows,
    diagnostics,
    columns: [...columns.values()].sort((a, b) => rank(a) - rank(b) || compare(a.label, b.label)),
  };
}
export function selectRows(rows: ValueRow[], search: string, sort: TableSort) {
  const query = search.trim().toLocaleLowerCase("fr");
  const direction = sort.desc ? -1 : 1;
  return rows
    .filter((row) =>
      [row.family, row.parameter, row.value, row.rawValue, row.asn1Path].some((text) =>
        text.toLocaleLowerCase("fr").includes(query),
      ),
    )
    .sort((a, b) => {
      const family = compare(a.family, b.family) || compare(a.familyId, b.familyId);
      if (family) return family * (sort.key === "family" ? direction : 1);
      const param = compare(a.parameter, b.parameter) || compare(a.parameterKey, b.parameterKey);
      if (param) return param * (sort.key === "parameter" ? direction : 1);
      if (["family", "parameter", "value"].includes(sort.key))
        return (
          compare(a.value, b.value) * (sort.key === "value" ? direction : 1) || compare(a.id, b.id)
        );
      const av = sort.key === "total" ? a.total : a.cells[sort.key]?.[sort.metric ?? "count"];
      const bv = sort.key === "total" ? b.total : b.cells[sort.key]?.[sort.metric ?? "count"];
      if (av == null || bv == null)
        return av == null ? (bv == null ? compare(a.value, b.value) : 1) : -1;
      return (av - bv) * direction || compare(a.value, b.value);
    });
}
export function tableCsv(rows: ValueRow[], columns: Column[], _mode?: GroupByMode) {
  const records: unknown[][] = [
    [
      "technology",
      "family_id",
      "family_name",
      "param_id",
      "asn1_path",
      "parameter_name",
      "value",
      "operator",
      "band",
      "occurrences",
      "denominator",
      "percentage",
      "total",
    ],
  ];
  for (const row of rows)
    for (const column of columns.length ? columns : [null]) {
      const cell = column ? row.cells[column.id] : null;
      records.push([
        row.technology,
        row.familyId,
        row.family,
        row.parameterId,
        row.asn1Path,
        row.parameter,
        row.rawValue,
        column?.operator,
        column?.band,
        cell?.count,
        cell?.denominator,
        cell?.percentage,
        row.total,
      ]);
    }
  return records
    .map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(";"))
    .join("\r\n");
}

export type ParameterGroup = {
  id: string;
  name: string;
  path: string;
  technology: string | null;
  rows: ValueRow[];
};
export type FamilyGroup = { id: string; name: string; parameters: ParameterGroup[] };
/** Input is already filtered and hierarchically sorted; retain its value order. */
export function groupRows(rows: ValueRow[]): FamilyGroup[] {
  const families = new Map<string, FamilyGroup>();
  const parameters = new Map<string, ParameterGroup>();
  for (const row of rows) {
    let family = families.get(row.familyId);
    if (!family) {
      family = { id: row.familyId, name: row.family, parameters: [] };
      families.set(row.familyId, family);
    }
    const key = JSON.stringify([row.familyId, row.parameterKey]);
    let parameter = parameters.get(key);
    if (!parameter) {
      parameter = {
        id: row.parameterKey,
        name: row.parameter,
        path: row.asn1Path,
        technology: row.technology,
        rows: [],
      };
      parameters.set(key, parameter);
      family.parameters.push(parameter);
    }
    parameter.rows.push(row);
  }
  return [...families.values()];
}
export type HierarchyRow =
  | { kind: "family"; id: string; family: FamilyGroup; open: boolean }
  | { kind: "parameter"; id: string; family: FamilyGroup; parameter: ParameterGroup; open: boolean }
  | { kind: "value"; id: string; row: ValueRow };
export function hierarchyRows(
  families: FamilyGroup[],
  closed: ReadonlySet<string>,
): HierarchyRow[] {
  const result: HierarchyRow[] = [];
  for (const family of families) {
    const id = JSON.stringify(["family", family.id]);
    const open = !closed.has(id);
    result.push({ kind: "family", id, family, open });
    if (!open) continue;
    for (const parameter of family.parameters) {
      const paramId = JSON.stringify(["parameter", family.id, parameter.id]);
      const paramOpen = !closed.has(paramId);
      result.push({ kind: "parameter", id: paramId, family, parameter, open: paramOpen });
      if (paramOpen)
        for (const row of parameter.rows) result.push({ kind: "value", id: row.id, row });
    }
  }
  return result;
}
