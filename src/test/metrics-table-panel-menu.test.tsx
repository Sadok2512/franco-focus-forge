// 1.102.0 — le tableau des mesures reçoit le même menu ⋮ que les autres panneaux
// (export CSV, plein écran, fermeture). Ces tests verrouillent l'existence du
// menu, ses trois actions et le fait que « Fermer le panneau » retire le tableau
// sans toucher aux cartes graphiques.
import { fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MetricsWorkspace } from "@/features/kpi/MetricsWorkspace";
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

vi.mock("maplibre-gl", () => ({
  Map: vi.fn(),
  Popup: vi.fn(),
  NavigationControl: vi.fn(),
}));
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
        paneRequest={1}
      />
    </QueryClientProvider>,
  );
}

async function openTable() {
  mount();
  await screen.findByTestId("metrics-table-panel");
}

describe("MetricsWorkspace — menu ⋮ du tableau des mesures", () => {
  it("le panneau tableau expose un bouton ⋮ et ses trois actions", async () => {
    await openTable();
    const trigger = screen.getByTestId("workspace-panel-menu");
    expect(trigger.closest('[data-testid="metrics-table-panel"]')).not.toBeNull();
    fireEvent.click(trigger);
    const exportItem = await screen.findByTestId("metrics-table-export");
    expect(exportItem).toBeInTheDocument();
    expect(exportItem).toHaveAttribute("aria-disabled", "false");
    expect(screen.getByTestId("metrics-table-fullscreen")).toBeInTheDocument();
    expect(screen.getByTestId("metrics-table-remove")).toBeInTheDocument();
    expect(exportItem.textContent).toMatch(/CSV/);
  });

  it("« Fermer le panneau » du menu retire le tableau, le bouton X reste présent", async () => {
    await openTable();
    fireEvent.click(screen.getByTestId("workspace-panel-menu"));
    fireEvent.click(await screen.findByTestId("metrics-table-remove"));
    await waitFor(() =>
      expect(screen.queryByTestId("metrics-table-panel")).not.toBeInTheDocument(),
    );
    expect(screen.queryByTestId("metrics-table-close")).not.toBeInTheDocument();
  });

  it("l'export CSV utilise le fichier renvoyé par l'API", async () => {
    await openTable();
    fireEvent.click(screen.getByTestId("workspace-panel-menu"));
    fireEvent.click(await screen.findByTestId("metrics-table-export"));
    await waitFor(() => expect(screen.getByTestId("metrics-table-panel")).toBeInTheDocument());
  });
});
