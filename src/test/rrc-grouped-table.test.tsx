import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  buildGroupedTable,
  selectRows,
  tableCsv,
  groupRows,
  hierarchyRows,
} from "@/features/dict-v2/grouped-table";
import { GroupedValueTable } from "@/features/dict-v2/GroupedValueTable";
import type { DictTreeResponse, DistributionBlock } from "@/lib/api/dict-v2";
const block: DistributionBlock = {
  param_key: "stable-prach",
  display_name: "prach-ConfigIndex",
  origin: "network_config",
  n_total: 10,
  distinct_values: 3,
  verdict: "NON_COMPARE",
  comparability: "",
  result_id: "evidence",
  values: [
    {
      value: "3",
      value_display: "3",
      groups: [
        { operator: "Orange", band: "B1", n: 2 },
        { operator: "Free", band: "B1", n: 0 },
      ],
    },
    {
      value: "5",
      value_display: "5",
      groups: [
        { operator: "Orange", band: "B1", n: 6 },
        { operator: "Free", band: "B1", n: 2 },
      ],
    },
    { value: "20", value_display: "20", groups: [] },
  ],
};
const catalog: DictTreeResponse = {
  project_id: "test",
  view: "catalog",
  total_rows: 1,
  distinct_param_keys: 1,
  tree: [
    {
      techno: "LTE",
      origins: [
        {
          origin: "network_config",
          messages: [
            {
              message: "SIB2",
              groups: [
                {
                  name: "Accès & timers",
                  kpis: [{ param_key: block.param_key, display_name: block.display_name, n: 10 }],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};
describe("RRC grouped values", () => {
  it("uses catalog metadata and stable parameter identifiers without modifying evidence", () => {
    const original = JSON.stringify(block);
    const model = buildGroupedTable([block], "operator", catalog);
    expect(model.rows.map((row) => row.family)).toEqual(Array(3).fill("Accès & timers"));
    expect(model.rows.every((row) => row.parameterId === "stable-prach")).toBe(true);
    expect(JSON.stringify(block)).toBe(original);
    expect(buildGroupedTable([block], "operator").rows[0]!.family).toBe("Famille non renseignée");
  });
  it("preserves API counts, null and zero without inventing denominators or percentages", () => {
    const model = buildGroupedTable([block], "operator", catalog);
    const orange = model.columns.find((c) => c.operator === "Orange")!.id;
    const free = model.columns.find((c) => c.operator === "Free")!.id;
    expect(model.rows[0]!.cells[orange]).toEqual({ count: 2, denominator: null, percentage: null });
    expect(model.rows[0]!.cells[free]).toEqual({ count: 0, denominator: null, percentage: null });
    expect(model.rows[2]!.cells[orange]).toEqual({ count: null, denominator: null, percentage: null });
    expect(model.rows[2]!.total).toBeNull();
    expect(
      selectRows(model.rows, "3", { key: "value", desc: false })[0]!.cells[orange]!.percentage,
    ).toBeNull();
  });
  it("keeps operator/band counts separate without calculating missing percentages", () => {
    const b = {
      ...block,
      values: [
        {
          value: "1",
          value_display: "1",
          groups: [
            { operator: "Orange", band: "B1", n: 2 },
            { operator: "Orange", band: "B3", n: 0 },
          ],
        },
        { value: "2", value_display: "2", groups: [{ operator: "Orange", band: "B1", n: 6 }] },
      ],
    };
    const model = buildGroupedTable([b], "operator_band");
    expect(model.rows[0]!.cells[model.columns.find((c) => c.band === "B1")!.id]!.percentage).toBeNull();
    expect(
      model.rows[0]!.cells[model.columns.find((c) => c.band === "B3")!.id]!.percentage,
    ).toBeNull();
    expect(tableCsv(model.rows, model.columns, "operator_band").split("\r\n")[0]).toContain(
      '"band"',
    );
  });
  it("retains all values for family/parameter search and never interleaves parameter groups", () => {
    const other = { ...block, param_key: "different-id", display_name: block.display_name };
    const model = buildGroupedTable([block, other], "operator", catalog);
    expect(selectRows(model.rows, "prach", { key: "total", desc: true })).toHaveLength(6);
    expect(selectRows(model.rows, "Accès", { key: "value", desc: false })).toHaveLength(3);
    for (const key of ["total", "value", model.columns[0]!.id]) {
      const selected = selectRows(model.rows, "", { key, desc: true });
      expect(new Set(selected.slice(0, 3).map((row) => row.parameterId)).size).toBe(1);
      expect(new Set(selected.slice(3).map((row) => row.parameterId)).size).toBe(1);
    }
  });
  it("exports explicit identity and raw counts in every record including missing cells", () => {
    const model = buildGroupedTable([block], "operator", catalog);
    const lines = tableCsv(model.rows, model.columns, "operator").split("\r\n");
    expect(lines).toHaveLength(7);
    expect(lines[0]).toBe(
      '"technology";"family_id";"family_name";"param_id";"asn1_path";"parameter_name";"value";"operator";"band";"occurrences";"denominator";"percentage";"total"',
    );
    expect(
      lines
        .slice(1)
        .every((line) =>
          line.includes('"Accès & timers";"stable-prach";"stable-prach";"prach-ConfigIndex"'),
        ),
    ).toBe(true);
    expect(lines.some((line) => line.includes('"Orange";"";"2";"";"";""'))).toBe(true);
    expect(lines.some((line) => line.includes('"Orange";"";"";"";"";""'))).toBe(true);
  });
  it("renders labels once visually, retains accessible context after searching, and shows zero", () => {
    const { container } = render(
      <GroupedValueTable blocks={[block]} groupBy="operator" catalog={catalog} />,
    );
    expect(container.querySelectorAll("[data-row-kind=family] .rrc-hierarchy-name")).toHaveLength(
      1,
    );
    expect(
      container.querySelectorAll("[data-row-kind=parameter] .rrc-hierarchy-name"),
    ).toHaveLength(1);
    expect(container.querySelectorAll("[data-row-kind=value]")).toHaveLength(3);
    expect(screen.queryByRole("columnheader", { name: /^Total/ })).not.toBeInTheDocument();
    expect(container.querySelectorAll("thead th")).toHaveLength(3);
    expect(container.querySelector("[data-row-kind=value]")!.children).toHaveLength(3);
    expect(screen.getByTitle("Pourcentage et dénominateur non exposés par l’API. prach-ConfigIndex · Free : 0 / — · —")).toHaveTextContent(
      "0 · —",
    );
    fireEvent.change(screen.getByLabelText("Rechercher une valeur"), { target: { value: "20" } });
    expect(container.querySelectorAll("[data-row-kind=value]")).toHaveLength(1);
    expect(container.querySelector("[data-row-kind=family] .rrc-hierarchy-name")).toHaveTextContent(
      "Accès & timers",
    );
    expect(container.querySelector(".rrc-number")).toHaveTextContent("—");
  });
});

describe("RRC V3 hierarchy", () => {
  it("keeps distinct paths and technologies apart despite identical names", () => {
    const blocks = [
      { ...block, technology: "LTE", asn1_path: "SIB2/path-a" },
      { ...block, technology: "NR", asn1_path: "SIB2/path-b" },
    ];
    const model = buildGroupedTable(blocks, "operator", catalog);
    const families = groupRows(selectRows(model.rows, "", { key: "value", desc: false }));
    expect(families).toHaveLength(1);
    expect(families[0]!.parameters).toHaveLength(2);
    expect(new Set(model.rows.map((row) => row.id)).size).toBe(6);
    expect(selectRows(model.rows, "path-b", { key: "value", desc: false })).toHaveLength(3);
    expect(model.rows.every(row => row.total === null)).toBe(true);
  });
  it("preserves the API population and cells without calculating a replacement total", () => {
    const source = { ...block, n_total: 99 };
    const original = JSON.stringify(source);
    const model = buildGroupedTable([source], "operator", catalog);
    expect(model.rows.every(row => row.total === null)).toBe(true);
    expect(model.rows[0]!.cells[model.columns[0]!.id]!.count).toBe(2);
    render(<GroupedValueTable blocks={[source]} groupBy="operator" catalog={catalog} />);
    fireEvent.change(screen.getByLabelText("Rechercher une valeur"), {
      target: { value: "no match" },
    });
    expect(JSON.stringify(source)).toBe(original);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("preserves collapse on sort, auto-expands search matches and restores previous state", () => {
    const { container } = render(
      <GroupedValueTable blocks={[block]} groupBy="operator" catalog={catalog} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Réduire le paramètre prach-ConfigIndex" }));
    expect(container.querySelectorAll("[data-row-kind=value]")).toHaveLength(0);
    fireEvent.change(screen.getByLabelText("Ordre des valeurs"), { target: { value: "desc" } });
    expect(
      screen.getByRole("button", { name: "Développer le paramètre prach-ConfigIndex" }),
    ).toHaveAttribute("aria-expanded", "false");
    fireEvent.change(screen.getByLabelText("Rechercher une valeur"), { target: { value: "20" } });
    expect(container.querySelectorAll("[data-row-kind=value]")).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Réduire la famille Accès & timers" }),
    ).toHaveAttribute("aria-expanded", "true");
    fireEvent.change(screen.getByLabelText("Rechercher une valeur"), { target: { value: "" } });
    expect(container.querySelectorAll("[data-row-kind=value]")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Tout développer" }));
    expect(container.querySelectorAll("[data-row-kind=value]")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Tout réduire" }));
    expect(container.querySelectorAll("[data-row-kind=family]")).toHaveLength(1);
    expect(container.querySelectorAll("[data-row-kind=parameter]")).toHaveLength(0);
  });
  it("windows thousands of values without truncating export or inventing denominators", () => {
    const large = {
      ...block,
      n_total: 2000,
      distinct_values: 2000,
      values: Array.from({ length: 2000 }, (_, n) => ({
        value: String(n),
        value_display: String(n),
        groups: [{ operator: "Orange", n: 1 }],
      })),
    };
    const model = buildGroupedTable([large], "operator", catalog);
    expect(model.diagnostics).toEqual([]);
    expect(model.rows[1999]!.cells[model.columns[0]!.id]!.denominator).toBeNull();
    expect(tableCsv(model.rows, model.columns).split("\r\n")).toHaveLength(2001);
    expect(hierarchyRows(groupRows(model.rows), new Set())).toHaveLength(2002);
    const { container } = render(
      <GroupedValueTable blocks={[large]} groupBy="operator" catalog={catalog} />,
    );
    expect(container.querySelectorAll("tbody tr").length).toBeLessThan(35);
    fireEvent.scroll(screen.getByRole("region", { name: "Valeurs, tableau défilant" }), {
      target: { scrollTop: 78000 },
    });
    expect(container.querySelectorAll("tbody tr").length).toBeLessThan(35);
    expect(container.querySelector("[data-row-kind=value]")).toHaveTextContent("1939");
  });
});

it("exports observed values even when no operator population is available", () => {
  const model = buildGroupedTable(
    [
      {
        ...block,
        n_total: 0,
        values: [{ value: "missing", value_display: "missing", groups: [] }],
      },
    ],
    "operator",
  );
  expect(model.columns).toHaveLength(0);
  expect(tableCsv(model.rows, model.columns).split("\r\n")).toHaveLength(2);
  expect(model.rows[0]!.total).toBeNull();
});
