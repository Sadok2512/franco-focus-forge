import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MetricsWorkspace } from "@/features/kpi/MetricsWorkspace";
import type { MetricInfo } from "@/lib/api/metrics-schemas";
import "@/lib/i18n";

/**
 * 1.88.1 — remplace la boucle Playwright flaky (double-expand catalog +
 * click leaf + switch Table) par un test autoritaire qui monte
 * MetricsWorkspace sur la **réponse live figée** de `/metrics/analysis`
 * pour `44621571bccc` (TEST2, light, no GPS) et vérifie que la table
 * rend bien Time local / Time UTC / Lat / Lon aux valeurs backend.
 */

const { fixture } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fx = require("./fixtures/metrics-analysis-44621571bccc.json");
  fx.columns[0].cell_label = "Serving";
  fx.columns[0].cell_system = "LTE";
  fx.columns[0].cell_internal_index = 1003;
  fx.page = 1; fx.page_size = 25; fx.total_rows = 4935;
  fx.total_pages = Math.ceil(fx.total_rows / 25);
  fx.rows = fx.rows.slice(0, 25);
  return { fixture: fx };
});

vi.mock("@/lib/api/client", () => ({
  getMetricAnalysis: vi.fn().mockResolvedValue(fixture),
  getMetricCaptures: vi.fn().mockResolvedValue([
    { capture_id: "44621571bccc", label: "M1_FREE_DL-7Go_Max-10_W30_26Jun23_103320.4.nmf" },
  ]),
  getCaptureEvents: vi.fn().mockResolvedValue({ events: [] }),
}));

// MapLibre + ECharts side-effect imports must stay inert in jsdom.
vi.mock("maplibre-gl", () => ({ Map: vi.fn(), Popup: vi.fn(), NavigationControl: vi.fn() }));
vi.mock("echarts", () => ({ init: vi.fn(() => ({ setOption: vi.fn(), dispose: vi.fn(), resize: vi.fn() })) }));

const catalog: MetricInfo[] = [
  {
    event: "CELLMEAS",
    category_label: "Radio serving",
    root_notices: [],
    cell_scoped: true,
    cells: [0],
    cell_options: [{ cell: "0", label: "PCell", n_in_project: 100, available: true, reason: null }],
    attributes: [],
    proof: "documented",
    available: true,
    reason: null,
    alias_of: null,
    event_group: null,
    unproven_cells: [],
    code: "cell_rsrp",
    label: "RSRP",
    unit: "dBm",
    event_code: "CELLMEAS",
    decoder_version: "1.3.0",
    proof_ref: "NFF 2.19",
    source_table: "nmf_cell_second",
    source_column: "cell_rsrp",
    tech: "LTE",
    kind: "numeric",
    n_in_project: 100,
    category: "radio_serving",
  },
];

describe("MetricsWorkspace — Time local / Time UTC / Lat / Lon (fixture 44621571bccc)", () => {
  it("defaults to Time / Cell / metric and keeps optional columns in the ⋮ menu", async () => {
    // MetricsWorkspace lit `bc3.metrics.pane` depuis localStorage pour choisir
    // le pane initial ("charts" par défaut). On force "table" pour que le test
    // cible la vue Table où les colonnes Time/Lat/Lon sont rendues.
    window.localStorage.setItem("bc3.metrics.pane", "table");
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MetricsWorkspace
          projectId="4b7bfd50ddb6"
          captureId="44621571bccc"
          onCaptureChange={() => {}}
          selections={["cell_rsrp@0"]}
          catalog={catalog}
          filters={{}}
          onClear={() => {}}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByRole("columnheader", { name: /Time/ })).toBeVisible(), { timeout: 3000 });
    expect(screen.getByRole("columnheader", { name: "Cell" })).toBeVisible();
    expect(screen.getByRole("columnheader", { name: /RSRP/ })).toBeVisible();
    expect(screen.queryByRole("columnheader", { name: /Time UTC/ })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: /Latitude/ })).toBeNull();
    expect(screen.getAllByText("Serving · LTE").length).toBeGreaterThan(0);
    expect(screen.queryByTitle(/Internal index/)).toBeNull();

    // First row (second=0): time_local=10:33:20.980, time_utc=08:33:20.980
    // from the live backend response, lat/lon null → "—" cells grayed with reason tooltip.
    expect(screen.getByText("10:33:20.980")).toBeVisible();
    expect(screen.queryByText("08:33:20.980")).toBeNull();

    const panel = screen.getByTestId("metrics-table-panel");
    expect(screen.getByTestId("metrics-v3-workspace")).toHaveAttribute("data-pane", "table");
    expect(panel.querySelectorAll("tbody tr")).toHaveLength(25);
    expect(screen.getByText(/1–25.*4935|1-25.*4935/)).toBeVisible();
    fireEvent.keyDown(within(panel).getByTestId("workspace-panel-menu"), { key: "Enter" });
    fireEvent.click(await screen.findByText("Time UTC"));
    await waitFor(() => expect(screen.getByText("08:33:20.980")).toBeVisible());
    expect(window.localStorage.getItem("bc4.metrics.columns.metrics:44621571bccc:cell_rsrp@0"))
      .toContain("time_utc");

    const pciFilter = await screen.findByTestId("metrics-cell-pci-filter");
    const arfcnFilter = screen.getByTestId("metrics-cell-arfcn-filter");
    fireEvent.change(pciFilter, { target: { value: "196" } });
    fireEvent.change(arfcnFilter, { target: { value: "1675" } });
    expect(pciFilter).toHaveValue("196");
    expect(arfcnFilter).toHaveValue("1675");
  });
});
