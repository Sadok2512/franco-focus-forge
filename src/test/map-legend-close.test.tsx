import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MetricsWorkspace } from "@/features/kpi/MetricsWorkspace";
import {
  MapLegendHeaderActions,
  MapLegendReopen,
} from "@/features/kpi/map-legend";
import { getMetricMap } from "@/lib/api/client";
import { readMetricViews, writeMetricViews } from "@/features/kpi/metric-views";
import "@/lib/i18n";

const renderers = vi.hoisted(() => ({ map: vi.fn() }));
vi.mock("@/features/kpi/KpiMapOSM", () => ({
  KpiMapOSM: (props: unknown) => {
    renderers.map(props);
    const p = props as { children?: ReactNode; layersLegend?: ReactNode };
    return (
      <div data-testid="metric-map-mock">
        {p.layersLegend}
        {p.children}
      </div>
    );
  },
}));
vi.mock("@/features/kpi/DriveRsrpLayer", () => ({ DriveRsrpLayer: () => null }));
vi.mock("@/lib/api/client", async () => {
  const fixture = (await import("./fixtures/metrics-analysis-44621571bccc.json")).default;
  return {
    getMetricAnalysis: vi.fn().mockResolvedValue(fixture),
    getMetricMap: vi.fn().mockResolvedValue({
      project_id: "project-a",
      capture_id: "44621571bccc",
      result_id: "map-result",
      decoder_version: "test",
      total_points: fixture.map_points.length,
      map_points: fixture.map_points,
    }),
    getMetricCaptures: vi.fn().mockResolvedValue([{ capture_id: "44621571bccc", label: "Demo" }]),
    getCaptureEvents: vi.fn().mockResolvedValue({ events: [] }),
  };
});

function renderMetricMap(workspaceId: string, code: string, label: string, unit: string) {
  writeMetricViews(workspaceId, { [code]: "map" });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MetricsWorkspace
        workspaceId={workspaceId}
        projectId="project-a"
        captureId="44621571bccc"
        selections={[code]}
        views={readMetricViews(workspaceId)}
        catalog={[{ code, label, unit } as never]}
        filters={{}}
        onClear={() => {}}
        onCaptureChange={() => {}}
        mapFillsAvailable
      />
    </QueryClientProvider>,
  );
}

async function legendOf() {
  const legend = await screen.findByTestId("metric-map-legend");
  await waitFor(() => expect(legend).toBeInTheDocument());
  return legend;
}


describe("Shared legend header controls", () => {
  it("flips the visibility switch and reports it", () => {
    const onToggleVisible = vi.fn();
    render(
      <MapLegendHeaderActions
        visible
        onToggleVisible={onToggleVisible}
        onClose={() => {}}
        visibilityLabel="Show / hide RSRP on the map"
        closeLabel="Close the RSRP legend"
      />,
    );
    const eye = screen.getByRole("button", { name: "Show / hide RSRP on the map" });
    expect(eye.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(eye);
    expect(onToggleVisible).toHaveBeenCalledTimes(1);
  });

  it("closes the legend block from its header", () => {
    const onClose = vi.fn();
    render(
      <MapLegendHeaderActions
        visible
        onToggleVisible={() => {}}
        onClose={onClose}
        visibilityLabel="Show / hide RSRP on the map"
        closeLabel="Close the RSRP legend"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Close the RSRP legend" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("reopens a closed legend from its single button", () => {
    const onOpen = vi.fn();
    render(<MapLegendReopen label="RSRP (dBm)" openLabel="Reopen legend" onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button", { name: /Reopen legend/ }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe("Metric map legend controls", () => {
  it("hides the points, closes to a reopen button and reopens", async () => {
    renderers.map.mockClear();
    renderMetricMap("legend-close", "cell_rsrp@0", "RSRP (LTE) @ Serving", "dBm");
    const legend = await legendOf();

    fireEvent.click(within(legend).getByRole("button", { name: /Show \/ hide/ }));
    fireEvent.click(within(legend).getByRole("button", { name: /Close the/ }));
    expect(within(legend).queryByRole("button", { name: /Show \/ hide/ })).toBeNull();
    const reopen = within(legend).getByRole("button", { name: /Reopen legend/ });
    fireEvent.click(reopen);
    await waitFor(() =>
      expect(within(legend).getByRole("button", { name: /Show \/ hide/ })).toBeInTheDocument(),
    );
  });

  it("lists one hideable row per DCI format code with its count", async () => {
    const points = [
      ...Array.from({ length: 3 }, (_, i) => ({
        seq: i + 1,
        lat: 48.8 + i * 0.0001,
        lng: 2.3 + i * 0.0001,
        code: "dci_format@0",
        value: 0,
        t_rel_s: i,
        tooltip: "DCI 0",
      })),
      {
        seq: 4,
        lat: 48.8004,
        lng: 2.3004,
        code: "dci_format@0",
        value: 10,
        t_rel_s: 3,
        tooltip: "DCI 10",
      },
      {
        seq: 5,
        lat: 48.8005,
        lng: 2.3005,
        code: "dci_format@0",
        value: 11,
        t_rel_s: 4,
        tooltip: "DCI 11",
      },
      {
        seq: 6,
        lat: 48.8006,
        lng: 2.3006,
        code: "dci_format@0",
        value: 20,
        t_rel_s: 5,
        tooltip: "DCI 20",
      },
    ];
    vi.mocked(getMetricMap).mockResolvedValue({
      project_id: "project-a",
      capture_id: "44621571bccc",
      result_id: "map-result",
      decoder_version: "test",
      total_points: points.length,
      map_points: points,
    } as never);
    renderers.map.mockClear();
    renderMetricMap("legend-dci", "dci_format@0", "DCI format (bloc LTE) @ SCell 3", "");
    const legend = await legendOf();

    const rows = within(legend).getAllByRole("checkbox");
    expect(rows).toHaveLength(4);
    const code0 = within(legend).getByRole("checkbox", { name: /3/ });
    expect(code0).toBeChecked();
    fireEvent.click(code0);
    expect(code0).not.toBeChecked();
    expect(within(legend).getByRole("checkbox", { name: /20/ })).toBeChecked();
  });
});
