import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MetricsCatalogSidebar } from "@/features/kpi/MetricsCatalogSidebar";
import type { MetricCatalogResponse } from "@/lib/api/metrics-schemas";
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
        node("pcell", "legacy-event", "RSRP (LTE) @ Serving", 0, {
          metric_id: "cell_rsrp@lte-type-0",
          selection: "cell_rsrp@lte-type-0",
          event: "CELLMEAS",
          field_idx: 9,
          source_column: "cell_rsrp",
          technology: "LTE",
          metric_label: "RSRP",
          cell: "lte-type-0",
          cell_label: "PCell",
          cell_system: "LTE",
          raw_cell_type: 0,
          availability_status: "available",
          n: 12,
          selectable: true,
        }),
        node("pscell", "legacy-event", "RSRP (NR) @ SCG PSCell", 5, {
          metric_id: "cell_rsrp@nr-type-199",
          event: "CELLMEAS",
          field_idx: 9,
          source_column: "cell_rsrp",
          technology: "NR",
          metric_label: "RSRP",
          cell: "nr-type-199",
          cell_label: "PSCell",
          cell_system: "NR",
          raw_cell_type: 199,
          availability_status: "no_data",
          proof: "open",
          reason: "P4 proof pending",
        }),
      ],
    } satisfies MetricCatalogResponse);
    const onToggle = vi.fn();
    const onVisualization = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MetricsCatalogSidebar
          projectId="TEST2"
          selected={[]}
          onToggle={onToggle}
          onVisualization={onVisualization}
          searchRef={createRef<HTMLInputElement>()}
        />
      </QueryClientProvider>,
    );

    // Technology roots auto-expand on first data arrival so the sidebar
    // is never read as empty. Groups and metrics still expand on demand.
    const lte = await screen.findByRole("button", { name: "LTE" });
    await waitFor(() => expect(lte).toHaveAttribute("aria-expanded", "true"));
    const rsrpFam = screen.getByRole("button", { name: /^RSRP/ });
    expect(rsrpFam).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(rsrpFam);
    expect(rsrpFam).toHaveAttribute("aria-expanded", "true");

    // Default tree contains only the selectable leaf.
    expect(screen.getByText("PCell")).toBeVisible();
    expect(screen.queryByText("PSCell")).toBeNull();

    // The existing grey rendering is restored by the opt-in switch.
    fireEvent.click(screen.getByRole("switch", { name: "Show unavailable" }));
    // NR appears once unavailable leaves are revealed; the user still expands
    // it manually because auto-expand only fires while the open set is empty.
    fireEvent.click(screen.getByRole("button", { name: "NR" }));
    fireEvent.click(screen.getAllByRole("button", { name: /^RSRP/ })[1]!);
    expect(screen.getByText("PSCell")).toBeVisible();

    // P4 (open-proof) leaf still visible but visually disabled.
    const pscellLeaf = screen.getByText("PSCell").closest(".kpi-tree-leaf");
    expect(pscellLeaf).toHaveClass("opacity-45");

    // Cell click opens details only; the ⋮ menu is the sole panel-creation path.
    const pcellButton = screen.getByRole("button", { name: "Select PCell" });
    expect(pcellButton).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(pcellButton);
    expect(onToggle).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Visualisation PCell" })).toBeVisible();
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

  it("renders a semantic neighbour role without confusing it with physical identity", async () => {
    getMetrics.mockResolvedValue({
      catalogue_version: "2.60.0",
      title: "Nemo metrics",
      header: "",
      decoder_version: "1.8.2",
      reason: "",
      metrics: [],
      nodes: [
        node("detected", "legacy-event", "RSRP (LTE) @ Detected LTE neighbour", 0, {
          metric_id: "cell_rsrp@lte-type-2",
          selection: "cell_rsrp@lte-type-2",
          event: "CELLMEAS",
          source_column: "cell_rsrp",
          technology: "LTE",
          metric_label: "RSRP",
          cell: "lte-type-2",
          cell_label: "Detected LTE neighbour",
          cell_system: "LTE",
          raw_cell_type: 2,
          availability_status: "available",
          n: 1465,
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

    // LTE auto-expanded on first render; drill directly to the RSRP family.
    await screen.findByRole("button", { name: "LTE" });
    fireEvent.click(screen.getByRole("button", { name: /RSRP/ }));
    expect(screen.getByText("Detected LTE neighbour")).toBeVisible();
    expect(screen.queryByText(/1675|PCI 196/)).toBeNull();
  });

  it("lists only metrics returned by the metrics API", async () => {
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
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MetricsCatalogSidebar
          projectId="TEST2"
          selected={[]}
          onToggle={vi.fn()}
          searchRef={createRef<HTMLInputElement>()}
          selectionCount={0}
        />
      </QueryClientProvider>,
    );

    const searches = await screen.findAllByRole("textbox", { name: "Search metrics" });
    expect(searches).toHaveLength(1);
    expect(screen.getByTestId("metrics-unified-selection-count")).toHaveTextContent("0 selected");
    fireEvent.change(searches[0]!, { target: { value: "RSRP" } });
    expect(screen.getByText("Raw RSRP")).toBeVisible();
    expect(screen.queryByText("Measured RSRP")).toBeNull();
    expect(screen.queryByText("Measured SINR")).toBeNull();
  });

  it("auto-expands every visible Technology root so the Metrics tree is never read as empty", async () => {
    getMetrics.mockResolvedValue({
      catalogue_version: "2.60.0",
      title: "Nemo metrics",
      header: "LTE + NR",
      decoder_version: "1.9.0",
      reason: "",
      metrics: [],
      nodes: [
        node("pcell", "legacy-event", "RSRP (LTE) @ Serving", 0, {
          metric_id: "cell_rsrp@lte-type-0",
          selection: "cell_rsrp@lte-type-0",
          event: "CELLMEAS",
          source_column: "cell_rsrp",
          technology: "LTE",
          metric_label: "RSRP",
          cell: "lte-type-0",
          cell_label: "PCell",
          cell_system: "LTE",
          raw_cell_type: 0,
          availability_status: "available",
          n: 12,
          selectable: true,
        }),
        node("pci", "legacy-event", "PCI (NR) @ Serving", 1, {
          metric_id: "cell_pci@nr-type-0",
          selection: "cell_pci@nr-type-0",
          event: "CELLMEAS",
          source_column: "cell_pci",
          technology: "NR",
          metric_label: "PCI",
          cell: "nr-type-0",
          cell_label: "PCell",
          cell_system: "NR",
          raw_cell_type: 0,
          availability_status: "available",
          n: 8,
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

    const lte = await screen.findByRole("button", { name: "LTE" });
    const nr = screen.getByRole("button", { name: "NR" });
    await waitFor(() => {
      expect(lte).toHaveAttribute("aria-expanded", "true");
      expect(nr).toHaveAttribute("aria-expanded", "true");
    });
    // A root the user collapses explicitly must stay collapsed on the next
    // re-render — the auto-expand only kicks in while the open set is empty.
    fireEvent.click(lte);
    expect(lte).toHaveAttribute("aria-expanded", "false");
    expect(nr).toHaveAttribute("aria-expanded", "true");
  });
});
