import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
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
  it("renders 4 time/GPS columns in Table view with backend values (no_gps_in_capture)", async () => {
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

    // Headers.
    await waitFor(() => expect(screen.getByText("Time local")).toBeVisible(), { timeout: 3000 });
    expect(screen.getByText("Time UTC")).toBeVisible();
    expect(screen.getByText("Latitude")).toBeVisible();
    expect(screen.getByText("Longitude")).toBeVisible();

    // Header subtitles reflect fixture: capture_date=2026-06-23, offset UTC+2h.
    const latHeader = screen.getByText("Latitude").closest("th");
    expect(latHeader).toBeTruthy();
    expect(screen.getAllByText(/2026-06-23 · UTC\+2h/).length).toBeGreaterThan(0);

    // First row (second=0): time_local=10:33:20.980, time_utc=08:33:20.980
    // from the live backend response, lat/lon null → "—" cells grayed with reason tooltip.
    expect(screen.getByText("10:33:20.980")).toBeVisible();
    expect(screen.getByText("08:33:20.980")).toBeVisible();

    // Null GPS → multiple "—" cells with reason tooltip "no_gps_in_capture" (humanized).
    const dashCells = screen.getAllByTitle("Pas de GPS dans la capture");
    expect(dashCells.length).toBeGreaterThan(0);
  });
});
