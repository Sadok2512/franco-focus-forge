// Style de graphe + glisser-déposer sur un graphe :
//  - le ⋮ d'une carte expose un sous-menu Style (tracé Ligne/Barres/Points +
//    couleur) mémorisé par onglet ;
//  - déposer une métrique du catalogue sur la carte l'ajoute comme série du
//    même graphe (jamais au workspace), et la demande porte les deux codes.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MetricsWorkspace } from "@/features/kpi/MetricsWorkspace";
import { getMetricAggregate, getMetricSeries } from "@/lib/api/metrics";
import {
  getMetricAnalysis,
  getMetricSeries as getWorkspaceMetricSeries,
} from "@/lib/api/client";
import { MAP_METRIC_MIME } from "@/features/kpi/map-metric-drop";
import { addGraphSeries, normalizeUnit } from "@/features/kpi/graph-series-drop";
import type { MetricViews } from "@/features/kpi/metric-views";
import "@/lib/i18n";

// La carte graphe demande ses captures/séries via @/lib/api/metrics, le
// workspace charge l'analyse via @/lib/api/client : les deux sont simulés.
vi.mock("@/lib/api/client", async () => {
  const fixture = (await import("./fixtures/metrics-analysis-44621571bccc.json")).default;
  return {
    getMetricAnalysis: vi.fn().mockResolvedValue(fixture),
    getMetricCaptures: vi.fn().mockResolvedValue([{ capture_id: "44621571bccc", label: "M1" }]),
    getMetricMap: vi.fn().mockResolvedValue({ points: [] }),
    getMetricSeries: vi.fn().mockResolvedValue({
      series: [
        {
          code: "cell_rsrp@0",
          label: "RSRP · PCell",
          unit: "dBm",
          kind: "numeric",
          points: [{ seq: 1, t_rel_s: 0, value: -100 }],
        },
      ],
      origin_ts: "10:33:20.980",
      nmf_start_at: null,
      utc_offset_min: null,
      capture_date: null,
    }),
    getSignaling: vi.fn().mockResolvedValue({ points: [] }),
    getCaptureEvents: vi.fn().mockResolvedValue({ events: [] }),
  };
});
vi.mock("@/lib/api/metrics", async () => {
  const fixture = (await import("./fixtures/metrics-analysis-44621571bccc.json")).default;
  return {
    getMetrics: vi.fn().mockResolvedValue([]),
    metricRequestQuery: () => "",
    getMetricCaptures: vi.fn().mockResolvedValue([{ capture_id: "44621571bccc", label: "M1" }]),
    getCaptureEvents: vi.fn().mockResolvedValue({ events: [] }),
    getMetricAnalysis: vi.fn().mockResolvedValue(fixture),
    getMetricMap: vi.fn().mockResolvedValue({ points: [] }),
    getMetricSeries: vi.fn().mockResolvedValue({
      series: [
        {
          code: "cell_rsrp@0",
          label: "RSRP · PCell",
          unit: "dBm",
          kind: "numeric",
          points: [
            { seq: 1, t_rel_s: 0, value: -100 },
            { seq: 2, t_rel_s: 1, value: -101 },
          ],
        },
        {
          code: "cell_rsrq@0",
          label: "RSRQ",
          unit: "dB",
          kind: "numeric",
          points: [
            { seq: 1, t_rel_s: 0, value: -12 },
            { seq: 2, t_rel_s: 1, value: -13 },
          ],
        },
      ],
      origin_ts: "10:33:20.980",
      nmf_start_at: null,
      utc_offset_min: null,
      capture_date: null,
    }),
    getMetricAggregate: vi.fn().mockResolvedValue({ groups: [] }),
  };
});
vi.mock("maplibre-gl", () => ({ Map: vi.fn(), Popup: vi.fn(), NavigationControl: vi.fn() }));
vi.mock("echarts", () => ({
  init: vi.fn(() => ({ setOption: vi.fn(), dispose: vi.fn(), resize: vi.fn() })),
}));

function mount(views?: MetricViews) {
  window.localStorage.clear();
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MetricsWorkspace
        projectId="4b7bfd50ddb6"
        captureId="44621571bccc"
        onCaptureChange={() => {}}
        selections={["cell_rsrp@0"]}
        catalog={[]}
        filters={{}}
        onClear={() => {}}
        workspaceId="t1"
        views={views}
      />
    </QueryClientProvider>,
  );
}

async function mountedCard(views?: MetricViews) {
  mount(views);
  return (await waitFor(() => {
    const element = document.querySelector('[data-metric-code="cell_rsrp@0"]');
    expect(element).not.toBeNull();
    return element as HTMLElement;
  })) as HTMLElement;
}

// Le ⋮ s'ouvre au clavier en jsdom ; le sous-menu Style reste ouvert après un
// choix (preventDefault) pour enchaîner tracé puis couleur.
function openStyleMenu(card: HTMLElement) {
  const trigger = within(card).getByTestId("workspace-panel-menu");
  // jsdom ne connaît pas les pointeurs de Radix : le menu s'ouvre au clavier,
  // et seulement si le déclencheur a le focus.
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "Enter" });
  fireEvent.click(screen.getByTestId("metric-style-sub"));
}

describe("style de graphe", () => {
  it("envoie le code métrique décodé à l'agrégat histogramme", async () => {
    await mountedCard({ "cell_rsrp@0": "histogram" });

    await waitFor(() =>
      expect(getMetricAggregate).toHaveBeenCalledWith(
        "4b7bfd50ddb6",
        "cell_rsrp",
        "operator",
        {},
        expect.any(AbortSignal),
      ),
    );
  });

  it("ne charge pas la table d'analyse pour une carte graphique", async () => {
    vi.mocked(getMetricAnalysis).mockClear();
    vi.mocked(getWorkspaceMetricSeries).mockClear();
    await mountedCard({ "cell_rsrp@0": "graph" });

    await waitFor(() => expect(getWorkspaceMetricSeries).toHaveBeenCalled());
    expect(getMetricAnalysis).not.toHaveBeenCalled();
  });

  it("le sous-menu Style change le tracé et la couleur, et les mémorise par onglet", async () => {
    // Histogramme : le tracé temporel animé fermerait le menu en jsdom.
    const card = await mountedCard({ "cell_rsrp@0": "histogram" });
    openStyleMenu(card);
    fireEvent.click(screen.getByTestId("metric-plot-bar"));
    expect(JSON.parse(window.localStorage.getItem("bc3.metrics.styles.t1") ?? "{}")).toEqual({
      "cell_rsrp@0": { plot: "bar", color: "#1d4ed8" },
    });
    fireEvent.click(screen.getByTestId("metric-color-#0f766e"));
    expect(JSON.parse(window.localStorage.getItem("bc3.metrics.styles.t1") ?? "{}")).toEqual({
      "cell_rsrp@0": { plot: "bar", color: "#0f766e" },
    });
  });
});

describe("glisser-déposer sur un graphe", () => {
  it("déposer une métrique l'ajoute comme série du graphe et élargit la demande", async () => {
    const card = await mountedCard();
    const added = { kind: "metric", code: "cell_rsrq@0", label: "RSRQ", unit: "dB" };
    const dataTransfer = {
      types: [MAP_METRIC_MIME],
      getData: (type: string) => (type === MAP_METRIC_MIME ? JSON.stringify(added) : ""),
      dropEffect: "",
    };
    fireEvent.dragOver(card, { dataTransfer });
    expect(card.className).toContain("is-drop-target");
    fireEvent.drop(card, { dataTransfer });
    await waitFor(() =>
      expect(getMetricSeries).toHaveBeenCalledWith(
        "4b7bfd50ddb6",
        "44621571bccc",
        ["cell_rsrp@0", "cell_rsrq@0"],
        expect.any(AbortSignal),
      ),
    );
    // writeGraphSeries ne garde que code/label/unit/couleur : kind n'est pas
    // recopié, la série est déjà identifiée par son code.
    expect(
      JSON.parse(window.localStorage.getItem("bc4.graph.series.t1.cell_rsrp@0") ?? "[]"),
    ).toEqual([{ code: "cell_rsrq@0", label: "RSRQ", unit: "dB", color: expect.any(String) }]);
    // La série ajoutée est retirable depuis le sous-menu Style.
    await openStyleMenu(card);
    fireEvent.click(await screen.findByTestId("metric-series-remove-cell_rsrq@0"));
    expect(window.localStorage.getItem("bc4.graph.series.t1.cell_rsrp@0")).toBe("[]");
  });

  it("refuse la métrique déjà présente et une 3e unité (jamais une fausse échelle)", () => {
    expect(normalizeUnit("Mbit/s")).toBe("mbps");
    const base = { code: "a", unit: "dBm" };
    const first = addGraphSeries([], { code: "b", label: "B", unit: "dB" }, base);
    expect(first.ok).toBe(true);
    const duplicate = addGraphSeries(
      first.ok ? first.series : [],
      { code: "b", label: "B", unit: "dB" },
      base,
    );
    expect(duplicate).toEqual({ ok: false, reason: "duplicate" });
    const third = addGraphSeries(
      first.ok ? first.series : [],
      { code: "c", label: "C", unit: "%" },
      base,
    );
    expect(third).toEqual({ ok: false, reason: "axis" });
  });
});
