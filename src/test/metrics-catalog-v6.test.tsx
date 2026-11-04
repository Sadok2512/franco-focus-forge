import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MetricsCatalogSidebar,
  metricCatalogMatchesSearch,
} from "@/features/kpi/MetricsCatalogSidebar";
import { MAP_METRIC_MIME } from "@/features/kpi/map-metric-drop";
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
  it("matches every search word case-insensitively across catalogue content", () => {
    const group = node("group", "lte", "LTE_RSRP_SERVING · RSRP · CELLMEAS", 0, {
      node_type: "metric",
      event: "CELLMEAS",
    });
    const leaf = node("earfcn", "group", "LTE_EARFCN_SERVING_PCELL", 0, {
      display_code_lisible: "LTE_EARFCN_SERVING_PCELL",
      metric_id: "cell_ch@lte-type-0",
      event: "CELLMEAS",
    });

    expect(metricCatalogMatchesSearch(group, "rsrp serving")).toBe(true);
    expect(metricCatalogMatchesSearch(group, "SERVING rsrp")).toBe(true);
    expect(metricCatalogMatchesSearch(leaf, "earfcn")).toBe(true);
    expect(metricCatalogMatchesSearch(leaf, "EARFCN")).toBe(true);
    expect(metricCatalogMatchesSearch(leaf, "lte_earfcn_serving_pcell")).toBe(true);
    expect(metricCatalogMatchesSearch(leaf, "earfcn missing")).toBe(false);
  });

  it("searches unavailable dimensions and shows the complete catalogue release", async () => {
    getMetrics.mockResolvedValue({
      catalogue_version: "2.68.4",
      title: "Nemo metrics",
      header: "LTE",
      decoder_version: "1.11.2",
      reason: "from_catalog_release",
      catalog_release: {
        version: "2.68.4",
        spec_version: "2.50",
        decoder_min_version: "1.9.0",
        sha256: "catalog-sha",
        n_leaves: 8735,
      },
      metrics: [],
      nodes: [
        node("earfcn-scell5", "legacy-event", "legacy EARFCN", 0, {
          display_code_lisible: "LTE_EARFCN_SERVING_SCELL5",
          nom_court: "EARFCN_SERVING_SCELL5",
          display_branch: "LTE",
          tree_visible: true,
          kind: "DIMENSION",
          metric_id: "cell_ch@lte-type-14",
          event: "CELLMEAS",
          source_column: "cell_ch",
          technology: "LTE",
          metric_label: "Ch",
          cell: "lte-type-14",
          cell_label: "SCell 5",
          cell_system: "LTE",
          raw_cell_type: 14,
          availability_status: "no_data",
          reason: "No observations in project",
          selectable: false,
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

    expect(await screen.findByText("V2.68.4")).toBeVisible();
    fireEvent.click(screen.getByTestId("metrics-show-unavailable").querySelector("input")!);
    fireEvent.change(screen.getByRole("textbox", { name: "Search metrics" }), {
      target: { value: "earfcn serving" },
    });
    expect(await screen.findByText("LTE_EARFCN_SERVING_SCELL5")).toBeVisible();
  });
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
    // Oracle discipline: every tech of the certified reference is shown
    // by default (showUnavailable = true), including techs whose current
    // capture only exposes no_data leaves. LTE AND NR are both present
    // on first render.
    const lte = await screen.findByRole("button", { name: /^LTE\b/ });
    const nr = screen.getByRole("button", { name: /^NR\b/ });
    await waitFor(() => expect(lte).toHaveAttribute("aria-expanded", "true"));
    await waitFor(() => expect(nr).toHaveAttribute("aria-expanded", "true"));
    // Oracle hierarchy adds Category > Group between Technology and
    // Metric. Drill through "Serving radio" > "Serving" / "Neighbour"
    // before reaching the RSRP metric node.
    for (const name of ["Serving radio", "Serving", "Neighbour"]) {
      for (const btn of screen.queryAllByRole("button", { name: new RegExp(`^${name}\\b`) })) {
        if (btn.getAttribute("aria-expanded") === "false") fireEvent.click(btn);
      }
    }
    const rsrpFams = screen.getAllByRole("button", { name: /^RSRP/ });
    expect(rsrpFams.length).toBeGreaterThanOrEqual(1);
    for (const r of rsrpFams) {
      if (r.getAttribute("aria-expanded") === "false") fireEvent.click(r);
    }

    // Leaf label is now the oracle `hn` (technical name), not the role.
    // Both the selectable LTE PCell and the no_data NR PSCell leaves
    // surface; PSCell stays greyed-out with its reason tooltip.
    expect(screen.getByText("LTE_SERVING_RSRP_PCELL")).toBeVisible();
    expect(screen.getByText("NR_SERVING_RSRP_PSCELL")).toBeVisible();

    const pscellLeaf = screen.getByText("NR_SERVING_RSRP_PSCELL").closest(".kpi-tree-leaf");
    expect(pscellLeaf).toHaveClass("opacity-45");

    const pcellButton = screen.getByRole("button", { name: "Select LTE_SERVING_RSRP_PCELL" });
    expect(pcellButton).toHaveAttribute("aria-pressed", "false");
    const pcellLeaf = pcellButton.closest(".kpi-tree-leaf");
    expect(pcellLeaf).toHaveAttribute("draggable", "true");
    const setData = vi.fn();
    fireEvent.dragStart(pcellLeaf!, {
      dataTransfer: { effectAllowed: "", setData },
    });
    expect(setData).toHaveBeenCalledWith(
      MAP_METRIC_MIME,
      JSON.stringify({
        kind: "metric",
        code: "cell_rsrp@lte-type-0",
        label: "LTE_SERVING_RSRP_PCELL",
        unit: "",
      }),
    );
    fireEvent.click(pcellButton);
    expect(onToggle).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Visualisation LTE_SERVING_RSRP_PCELL" }),
    ).toBeVisible();
  });

  it("exports a selectable Metrics leaf through the shared Map drag contract", async () => {
    getMetrics.mockResolvedValue({
      catalogue_version: "v6",
      title: "Nemo metrics",
      header: "LTE",
      decoder_version: "1.9.0",
      reason: "",
      metrics: [],
      nodes: [
        node("pcell-drag", "legacy-event", "RSRQ (LTE) @ Serving", 0, {
          metric_id: "cell_rsrq@lte-type-0",
          selection: "cell_rsrq@lte-type-0",
          event: "CELLMEAS",
          source_column: "cell_rsrq",
          technology: "LTE",
          metric_label: "RSRQ",
          cell: "lte-type-0",
          cell_label: "PCell",
          cell_system: "LTE",
          raw_cell_type: 0,
          availability_status: "available",
          unit: "dB",
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
        />
      </QueryClientProvider>,
    );
    const lte = await screen.findByRole("button", { name: /^LTE\b/ });
    await waitFor(() => expect(lte).toHaveAttribute("aria-expanded", "true"));
    for (const name of ["Serving radio", "Serving"]) {
      for (const button of screen.queryAllByRole("button", { name: new RegExp(`^${name}\\b`) }))
        if (button.getAttribute("aria-expanded") === "false") fireEvent.click(button);
    }
    fireEvent.click(screen.getByRole("button", { name: /^RSRQ/ }));
    const leaf = screen.getByText("LTE_SERVING_RSRQ_PCELL").closest(".kpi-tree-leaf");
    expect(leaf).toHaveAttribute("draggable", "true");
    const setData = vi.fn();
    fireEvent.dragStart(leaf!, {
      dataTransfer: { effectAllowed: "none", setData },
    });
    expect(setData).toHaveBeenCalledWith(
      MAP_METRIC_MIME,
      JSON.stringify({
        kind: "metric",
        code: "cell_rsrq@lte-type-0",
        label: "LTE_SERVING_RSRQ_PCELL",
        unit: "dB",
      }),
    );
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

    // LTE auto-expanded on first render; drill through Serving radio >
    // Neighbour > RSRP to reach the detected-neighbour cell leaf.
    const lte = await screen.findByRole("button", { name: /^LTE\b/ });
    await waitFor(() => expect(lte).toHaveAttribute("aria-expanded", "true"));
    for (const name of ["Serving radio", "Neighbour"]) {
      for (const btn of screen.queryAllByRole("button", { name: new RegExp(`^${name}\\b`) })) {
        if (btn.getAttribute("aria-expanded") === "false") fireEvent.click(btn);
      }
    }
    fireEvent.click(screen.getByRole("button", { name: /^RSRP/ }));
    // Oracle hn for RSRP CELLMEAS raw=2 (Detected LTE neighbour).
    expect(screen.getByText("LTE_NBR_RSRP_DETECTED")).toBeVisible();
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
    await waitFor(() => expect(screen.getByText("Raw RSRP")).toBeVisible());
    expect(screen.queryByText("Measured RSRP")).toBeNull();
    expect(screen.queryByText("Measured SINR")).toBeNull();
  });

  it("keeps focus, selected metrics and one API request while debouncing search", async () => {
    getMetrics.mockResolvedValue({
      catalogue_version: "2.68.3",
      title: "Nemo metrics",
      header: "LTE",
      decoder_version: "1.9.0",
      reason: "",
      metrics: [],
      nodes: [
        node("earfcn", "legacy-event", "EARFCN", 0, {
          display_code_lisible: "LTE_EARFCN_SERVING_PCELL",
          nom_court: "EARFCN",
          metric_id: "cellmeas_ch@lte-type-0",
          selection: "cellmeas_ch@lte-type-0",
          event: "CELLMEAS",
          source: "measured-catalog",
          source_column: "cellmeas_ch",
          technology: "LTE",
          metric_label: "LTE_EARFCN_SERVING",
          cell: "lte-type-0",
          cell_label: "PCell",
          cell_system: "LTE",
          raw_cell_type: 0,
          availability_status: "available",
          n: 12,
          selectable: true,
        }),
      ],
    } satisfies MetricCatalogResponse);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MetricsCatalogSidebar
          projectId="TEST2"
          selected={["a", "b", "c", "d"]}
          onToggle={vi.fn()}
          searchRef={createRef<HTMLInputElement>()}
          selectionCount={4}
        />
      </QueryClientProvider>,
    );

    const input = await screen.findByRole("textbox", { name: "Search metrics" });
    const callsBeforeTyping = getMetrics.mock.calls.length;
    input.focus();
    for (const value of ["e", "ea", "ear", "earf", "earfc", "earfcn"]) {
      fireEvent.change(input, { target: { value } });
      expect(input).toHaveFocus();
      expect(input).toHaveValue(value);
      expect((input as HTMLInputElement).selectionStart).toBe(value.length);
    }
    expect(screen.getByTestId("metrics-unified-selection-count")).toHaveTextContent("4 selected");
    await waitFor(() => expect(screen.getByText("LTE_EARFCN_SERVING")).toBeVisible());
    expect(getMetrics).toHaveBeenCalledTimes(callsBeforeTyping);

    fireEvent.change(input, { target: { value: "measured-catalog" } });
    await waitFor(() =>
      expect(screen.getByText("No metrics match this search.")).toBeVisible(),
    );
    expect(input).toHaveFocus();
    expect(getMetrics).toHaveBeenCalledTimes(callsBeforeTyping);
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
        // RSRP is a KPI in the oracle for both LTE and NR; use raw=100
        // (SCG SCell 0) which maps to NR / Serving radio / RSRP in the
        // oracle, so this fixture reliably creates both LTE and NR tech
        // roots via the fallback-by-(event, raw, metric_label) match.
        node("nr-rsrp-pscell", "legacy-event", "RSRP (NR) @ SCG SCell 0", 1, {
          metric_id: "cell_rsrp@nr-type-100",
          selection: "cell_rsrp@nr-type-100",
          event: "CELLMEAS",
          source_column: "cell_rsrp",
          technology: "NR",
          metric_label: "RSRP",
          cell: "nr-type-100",
          cell_label: "SCG SCell 0",
          cell_system: "NR",
          raw_cell_type: 100,
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

    const lte = await screen.findByRole("button", { name: /^LTE\b/ });
    const nr = screen.getByRole("button", { name: /^NR\b/ });
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
