import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { MetricsCatalogSidebar } from "@/features/kpi/MetricsCatalogSidebar";
import type { MetricCatalogResponse } from "@/lib/api/metrics-schemas";
import "@/lib/i18n";

const getMetrics = vi.fn();
vi.mock("@/lib/api/client", () => ({ getMetrics: (...args: unknown[]) => getMetrics(...args) }));

// 1.88.1 — DOM aligné sur MetricsCatalogSidebar BC3 : chevron intégré dans la
// bar `kpi-tree-root` / `kpi-tree-family`, feuille = `button[aria-pressed]`
// avec `aria-label="Select <label>"`, status dot + ⋮ MoreVertical menu.
// Plus de bouton "Expand <name>" (vocabulaire Lovable retiré), plus de
// checkbox (sélection via toggle du bouton principal).

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

describe("Metrics catalogue v6 tree (BC3 DOM)", () => {
  it("expands category + family via chevron bar, selects leaf via Select button, keeps P4 leaves disabled with status dot", async () => {
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

    // Category "Serving radio" visible, closed by default.
    const servingRadio = await screen.findByRole("button", { name: /Serving radio/ });
    expect(servingRadio).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(servingRadio);
    expect(servingRadio).toHaveAttribute("aria-expanded", "true");

    // Family "RSRP ★[CELLMEAS #9]" visible, closed → open it.
    const rsrpFam = screen.getByRole("button", { name: /^RSRP/ });
    expect(rsrpFam).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(rsrpFam);
    expect(rsrpFam).toHaveAttribute("aria-expanded", "true");

    // Leaves visible : PCell + PSCell.
    expect(screen.getByText("RSRP — PCell")).toBeVisible();
    expect(screen.getByText("RSRP — PSCell")).toBeVisible();

    // P4 (open-proof) leaf still visible but visually disabled.
    const pscellLeaf = screen.getByText("RSRP — PSCell").closest(".kpi-tree-leaf");
    expect(pscellLeaf).toHaveClass("opacity-45");

    // Leaf = button[aria-pressed] with aria-label="Select <label>".
    const pcellButton = screen.getByRole("button", { name: /Select RSRP — PCell/i });
    expect(pcellButton).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(pcellButton);
    expect(onToggle).toHaveBeenCalledWith("cell_rsrp@0");
  });

  it("shows the compact loading bar while a catalogue request is in flight, never the empty message", async () => {
    getMetrics.mockReset();
    getMetrics.mockReturnValue(new Promise<MetricCatalogResponse>(() => {}));
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MetricsCatalogSidebar
          projectId="TEST2"
          selected={[]}
          onToggle={vi.fn()}
          searchRef={createRef<HTMLInputElement>()}
        />
      </QueryClientProvider>,
    );
    const bar = await screen.findByRole("progressbar", { name: "Loading catalogue…" });
    expect(bar).toHaveClass("kpi-measurements-progress");
    expect(bar.querySelector("span")).not.toBeNull();
    expect(screen.queryByText("No KPIs match this search.")).toBeNull();
  });

  it("offers a retry when the catalogue request fails and refetches on click", async () => {
    getMetrics.mockReset();
    getMetrics.mockRejectedValueOnce(new Error("Failed to fetch"));
    getMetrics.mockResolvedValue({
      catalogue_version: "v6",
      title: "Nemo metrics",
      header: "",
      metrics: [],
      nodes: [],
    } satisfies MetricCatalogResponse);
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MetricsCatalogSidebar
          projectId="TEST2"
          selected={[]}
          onToggle={vi.fn()}
          searchRef={createRef<HTMLInputElement>()}
        />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Failed to fetch");
    fireEvent.click(screen.getByRole("button", { name: /Retry catalogue/ }));
    expect(getMetrics).toHaveBeenCalledTimes(2);
  });
});
