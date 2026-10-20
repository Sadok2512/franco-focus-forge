import { expect, it } from "vitest";
import { render } from "@testing-library/react";
import { filterDistribution } from "@/features/dict-v2/distribution-view";
import { buildGroupedTable, selectRows } from "@/features/dict-v2/grouped-table";
import { GroupedValueTable } from "@/features/dict-v2/GroupedValueTable";
import type { DictDistributionResponse } from "@/lib/api/dict-v2";
const data: DictDistributionResponse = {
  project_id: "TEST",
  group_by: "operator_band",
  blocks: [
    {
      param_key: "TEST/key",
      display_name: "TEST-parameter",
      origin: "network_config",
      n_total: 13,
      distinct_values: 2,
      comparability: "COMPARABLE",
      verdict: "DIFFERENT",
      result_id: "TEST-proof",
      group_totals: [
        { operator: "Free", band: "TEST-B1", n: 4 },
        { operator: "Free", band: "TEST-B2", n: 6 },
        { operator: null, band: "TEST-B1", n: 3 },
      ],
      values: [
        {
          value: "1",
          value_display: "1",
          groups: [
            { operator: "Free", band: "TEST-B1", n: 1 },
            { operator: "Free", band: "TEST-B2", n: 3 },
          ],
        },
        { value: "2", value_display: "2", groups: [{ operator: "Free", band: "TEST-B1", n: 0 }] },
      ],
    },
  ],
};
it("projects API totals independently of value presence and table search", () => {
  const original = JSON.stringify(data);
  const filtered = filterDistribution(data, ["Free"], [], "operator")!;
  const model = buildGroupedTable(filtered.blocks, "operator");
  const id = model.columns[0]!.id;
  expect(model.rows[0]!.cells[id]).toEqual({ count: 4, denominator: 10, percentage: 40 });
  expect(model.rows[1]!.cells[id]).toEqual({ count: 0, denominator: 10, percentage: 0 });
  expect(
    selectRows(model.rows, "1", { key: "value", desc: false })[0]!.cells[id]!.denominator,
  ).toBe(10);
  const band = buildGroupedTable(
    filterDistribution(data, ["Free"], ["TEST-B1"], "operator")!.blocks,
    "operator",
  );
  expect(band.rows[0]!.cells[id]).toEqual({ count: 1, denominator: 4, percentage: 25 });
  expect(JSON.stringify(data)).toBe(original);
});
it("renders validated percentage and green bar, preserves zero and hides unattributed column", () => {
  const filtered = filterDistribution(data, [], [], "operator")!;
  const { container } = render(<GroupedValueTable blocks={filtered.blocks} groupBy="operator" />);
  expect(container.textContent).toContain("40,0 %");
  expect(container.textContent).toContain("0,0 %");
  const bar = container.querySelector<HTMLElement>(".rrc-cell-track span")!;
  expect(bar.style.width).toBe("40%");
  expect(bar.style.background).toBe("rgb(22, 163, 74)");
  expect(container.querySelector("thead")!.textContent).not.toMatch(/Total|Non attribué|N\/D/);
});
