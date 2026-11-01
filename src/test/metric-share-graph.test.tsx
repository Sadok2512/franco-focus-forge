// Le ⋮ d'une carte métrique propose « Copier le lien ». Le lien doit ouvrir le
// même workspace (panneaux + filtres, déjà dans l'URL) ET le même projet,
// puisque le projet ne vit que dans le localStorage du poste.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MetricsWorkspace } from "@/features/kpi/MetricsWorkspace";
import { buildShareUrl } from "@/features/kpi/share-link";
import "@/lib/i18n";

vi.mock("@/lib/api/client", async () => {
  const fixture = (await import("./fixtures/metrics-analysis-44621571bccc.json")).default;
  return {
    getMetricAnalysis: vi.fn().mockResolvedValue(fixture),
    getMetricCaptures: vi
      .fn()
      .mockResolvedValue([
        { capture_id: "44621571bccc", label: "M1_FREE_DL-7Go_Max-10_W30_26Jun23_103320.4.nmf" },
      ]),
    getCaptureEvents: vi.fn().mockResolvedValue({ events: [] }),
  };
});
vi.mock("maplibre-gl", () => ({ Map: vi.fn(), Popup: vi.fn(), NavigationControl: vi.fn() }));
vi.mock("echarts", () => ({
  init: vi.fn(() => ({ setOption: vi.fn(), dispose: vi.fn(), resize: vi.fn() })),
}));

function mount() {
  window.localStorage.removeItem("bc3.metrics.pane");
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
      />
    </QueryClientProvider>,
  );
}

describe("lien partagé d'une carte métrique", () => {
  it("ajoute le projet sans toucher aux autres paramètres, et remplace un projet déjà présent", () => {
    // `tabs` est du base64 brut : il doit ressortir octet pour octet.
    expect(buildShareUrl("4b7bfd50ddb6", "http://localhost:8080/kpi?tabs=YWJjKz0%3D&op=BYT")).toBe(
      "http://localhost:8080/kpi?tabs=YWJjKz0%3D&op=BYT&project=4b7bfd50ddb6",
    );
    expect(buildShareUrl("p2", "http://localhost:8080/kpi?project=p1&tabs=YWJj")).toBe(
      "http://localhost:8080/kpi?tabs=YWJj&project=p2",
    );
  });

  it("⋮ → Copier le lien copie l'URL courante avec le projet de la carte", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    window.history.replaceState({}, "", "/kpi?tabs=YWJjKz0%3D&op=BYT");
    mount();
    const card = (await waitFor(() => {
      const element = document.querySelector('[data-metric-code="cell_rsrp@0"]');
      expect(element).not.toBeNull();
      return element as HTMLElement;
    })) as HTMLElement;
    fireEvent.keyDown(within(card).getByTestId("workspace-panel-menu"), { key: "Enter" });
    fireEvent.click(await screen.findByTestId("metric-share-graph"));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const url = writeText.mock.calls[0][0] as string;
    expect(url).toContain("project=4b7bfd50ddb6");
    expect(url).toContain("tabs=YWJjKz0%3D");
    expect(url).toContain("op=BYT");
  });
});
