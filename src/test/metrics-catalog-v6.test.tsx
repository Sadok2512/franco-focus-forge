import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { MetricsCatalogSidebar } from "@/features/kpi/MetricsCatalogSidebar";
import type { MetricCatalogResponse } from "@/lib/api/metrics-schemas";
import "@/lib/i18n";

const getMetrics = vi.fn();
vi.mock("@/lib/api/client", () => ({ getMetrics: (...args: unknown[]) => getMetrics(...args) }));

const node = (
  node_id: string,
  parent_id: string | null,
  label: string,
  order: number,
  extra: Partial<MetricCatalogResponse["nodes"][number]> = {},
): MetricCatalogResponse["nodes"][number] => ({
  node_id,
  parent_id,
  label,
  order,
  note: null,
  source: null,
  node_type: parent_id ? "leaf" : "category",
  metric_id: null,
  selection: null,
  event: null,
  field_idx: null,
  source_column: null,
  unit: "",
  cell: null,
  n: 0,
  proof: "documented",
  selectable: false,
  reason: null,
  ...extra,
});

describe("Metrics catalogue v6 tree", () => {
  it("selects available cell leaves and keeps P4 leaves visible but disabled", async () => {
    getMetrics.mockResolvedValue({
      catalogue_version: "v6",
      title: "Nemo metrics",
      header: "LTE — 345 metrics + NR 16",
      metrics: [],
      nodes: [
        node("radio", null, "Serving radio", 0, { node_type: "category" }),
        node("rsrp", "radio", "RSRP ★[CELLMEAS #9]", 0, {
          node_type: "metric",
          source: "[CELLMEAS #9]",
        }),
        node("pcell", "rsrp", "RSRP — PCell", 0, {
          metric_id: "cell_rsrp@pcell",
          selection: "cell_rsrp@0",
          event: "CELLMEAS",
          field_idx: 9,
          source_column: "cell_rsrp",
          cell: "pcell",
          n: 12,
          selectable: true,
        }),
        node("pscell", "rsrp", "RSRP — PSCell", 5, {
          metric_id: "cell_rsrp@pscell",
          event: "CELLMEAS",
          field_idx: 9,
          source_column: "cell_rsrp",
          cell: "pscell",
          proof: "open",
          reason: "P4 proof pending",
        }),
      ],
    } satisfies MetricCatalogResponse);
    const onToggle = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MetricsCatalogSidebar
          projectId="TEST2"
          selected={[]}
          onToggle={onToggle}
          searchRef={createRef<HTMLInputElement>()}
        />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("Serving radio")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /Serving radio/i }));
    fireEvent.click(screen.getByRole("button", { name: /RSRP — RSRP \[CELLMEAS #9\]|RSRP$/i }));
    expect(screen.getByText("RSRP — PSCell")).toBeVisible();
    expect(screen.getByTitle("P4 proof pending")).toHaveClass("opacity-45");
    fireEvent.click(screen.getByRole("button", { name: /Select RSRP — PCell/i }));
    expect(onToggle).toHaveBeenCalledWith("cell_rsrp@0");
  });
});
