import { it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ValueExplorer } from "@/features/dict-v2/ValueExplorer";
vi.mock("@/components/bc4/Chart", () => ({
  Chart: ({ build }: { build: (colors: object) => unknown }) => (
    <pre data-testid="chart-options">
      {JSON.stringify(build({ fg: "black", muted: "gray", border: "gray" }))}
    </pre>
  ),
}));
it("switches rendering only, preserving real zero and missing values without connecting gaps", () => {
  render(
    <ValueExplorer
      distribution={{
        project_id: "TEST",
        group_by: "operator",
        blocks: [
          {
            param_key: "TEST/key",
            display_name: "TEST-param",
            origin: "network_config",
            n_total: 2,
            distinct_values: 3,
            comparability: "COMPARABLE",
            verdict: "DIFFERENT",
            result_id: "TEST",
            values: [
              { value: "1", value_display: "1", groups: [{ operator: "Free", n: 2 }] },
              { value: "2", value_display: "2", groups: [] },
              { value: "3", value_display: "3", groups: [{ operator: "Free", n: 0 }] },
            ],
          },
        ],
      }}
      groupBy="operator"
      onGroupByChange={() => {}}
      isLoading={false}
      error={null}
      selectedKeys={["TEST/key"]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Réglages du graphique TEST-param" }));
  for (const [mode, type, symbol] of [
    ["bar", "bar", false],
    ["scatter", "scatter", false],
    ["line", "line", false],
    ["line_points", "line", true],
  ] as const) {
    fireEvent.change(screen.getByLabelText("Type de graphique"), { target: { value: mode } });
    const option = JSON.parse(screen.getByTestId("chart-options").textContent!);
    expect(option.series[0]).toMatchObject({
      type,
      showSymbol: symbol,
      connectNulls: false,
      smooth: false,
      data: [2, null, 0],
      itemStyle: { color: "#16A34A" },
    });
    expect(option.xAxis.data).toEqual(["1", "2", "3"]);
  }
});
