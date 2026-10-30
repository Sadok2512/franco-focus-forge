import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { createRef, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MetricsCatalogSidebar } from "@/features/kpi/MetricsCatalogSidebar";
import { KpiCatalogSidebar } from "@/features/kpi/KpiCatalogSidebar";
import type { MetricCatalogResponse } from "@/lib/api/metrics-schemas";
import type { ProjectKpiCatalog } from "@/lib/api/project-kpi-schemas";
import "@/lib/i18n";

const getMetrics = vi.fn();
// Le catalogue passe par analytics-bootstrap → @/lib/api/metrics (pas client).
vi.mock("@/lib/api/metrics", () => ({ getMetrics: (...args: unknown[]) => getMetrics(...args) }));

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
  analytics_tab: parent_id ? "metrics" : null,
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
  // persistedQuery met le catalogue en cache localStorage : chaque test
  // repart d'un cache vide pour rester indépendant de l'ordre d'exécution.
  beforeEach(() => window.localStorage.clear());
  it("shows only selectable leaves by default and reveals unavailable leaves disabled", async () => {
    getMetrics.mockResolvedValue({
      catalogue_version: "v6",
      title: "Nemo metrics",
      header: "LTE — 345 metrics + NR 16",
      decoder_version: "",
      reason: "",
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

    // Default tree contains only the selectable leaf.
    expect(screen.getByText("RSRP — PCell")).toBeVisible();
    expect(screen.queryByText("RSRP — PSCell")).toBeNull();

    // The existing grey rendering is restored by the opt-in switch.
    fireEvent.click(screen.getByRole("switch", { name: "Show unavailable" }));
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
      decoder_version: "",
      reason: "",
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

  it("renders a physical neighbour identity without leaking its selector as a badge", async () => {
    getMetrics.mockResolvedValue({
      catalogue_version: "2.60.0",
      title: "Nemo metrics",
      header: "",
      decoder_version: "1.8.2",
      reason: "",
      metrics: [],
      nodes: [
        node("lte", null, "LTE", 0, { node_type: "category" }),
        node("detected", "lte", "RSRP @ Detected LTE neighbour", 0, {
          metric_id: "cell_rsrp@lte-type-2",
        }),
        node("physical", "detected", "ARFCN 1675 · PCI 196", 0, {
          metric_id: "cell_rsrp@lte-type-2!1675:196",
          selection: "cell_rsrp@lte-type-2!1675:196",
          event: "CELLMEAS",
          source_column: "cell_rsrp",
          n: 1465,
          proof: "physical-cell-identity",
          selectable: true,
        }),
      ],
    } satisfies MetricCatalogResponse);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MetricsCatalogSidebar
          projectId="TEST2"
          selected={[]}
          onToggle={vi.fn()}
          searchRef={createRef<HTMLInputElement>()}
        />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "LTE" }));
    fireEvent.click(screen.getByRole("button", { name: /RSRP @ Detected/ }));
    expect(screen.getByText("ARFCN 1675 · PCI 196")).toBeVisible();
    expect(screen.queryByText("LTE-TYPE-2!1675:196")).toBeNull();
    expect(screen.queryByTestId("per-cell-physical")).toBeNull();
  });

  it("uses one search for measured metrics and catalogue leaves in one panel", async () => {
    getMetrics.mockResolvedValue({
      catalogue_version: "v6",
      title: "Nemo metrics",
      header: "",
      decoder_version: "1.9.0",
      reason: "",
      metrics: [],
      nodes: [
        node("radio", null, "Radio", 0, { node_type: "category" }),
        node("raw-rsrp", "radio", "Raw RSRP", 0, {
          selection: "cell_rsrp@0",
          metric_id: "cell_rsrp@0",
          n: 12,
          selectable: true,
        }),
      ],
    } satisfies MetricCatalogResponse);
    const measuredCatalog: ProjectKpiCatalog = {
      project_id: "TEST2",
      catalog_version: "2.60.0",
      tree: [
        {
          techno: "LTE",
          families: [
            {
              family: "Radio",
              kpis: [
                {
                  code: "rsrp_measured",
                  name: "Measured RSRP",
                  nature: "metric",
                  analytics_tab: "metrics",
                  unit: "dBm",
                  source: "CELLMEAS",
                  formula: null,
                  status: "AVAILABLE",
                  reason: null,
                },
                {
                  code: "sinr_measured",
                  name: "Measured SINR",
                  nature: "metric",
                  analytics_tab: "metrics",
                  unit: "dB",
                  source: "CELLMEAS",
                  formula: null,
                  status: "AVAILABLE",
                  reason: null,
                },
              ],
            },
          ],
        },
      ],
    };
    function UnifiedHarness() {
      const [search, setSearch] = useState("");
      const searchRef = createRef<HTMLInputElement>();
      return (
        <MetricsCatalogSidebar
          projectId="TEST2"
          selected={[]}
          onToggle={vi.fn()}
          searchRef={searchRef}
          search={search}
          onSearchChange={setSearch}
          selectionCount={0}
          measuredTree={
            <KpiCatalogSidebar
              catalog={measuredCatalog}
              selected={[]}
              active={null}
              onToggle={vi.fn()}
              onVisualization={vi.fn()}
              searchRef={searchRef}
              searchValue={search}
              embedded
            />
          }
        />
      );
    }
    render(
      <QueryClientProvider client={new QueryClient()}>
        <UnifiedHarness />
      </QueryClientProvider>,
    );

    const searches = await screen.findAllByRole("textbox", { name: "Search metrics" });
    expect(searches).toHaveLength(1);
    expect(screen.getByTestId("metrics-unified-selection-count")).toHaveTextContent("0 selected");
    fireEvent.change(searches[0]!, { target: { value: "RSRP" } });
    expect(screen.getByText("Measured RSRP")).toBeVisible();
    expect(screen.getByText("Raw RSRP")).toBeVisible();
    expect(screen.queryByText("No KPIs match this search.")).toBeNull();
  });
});
