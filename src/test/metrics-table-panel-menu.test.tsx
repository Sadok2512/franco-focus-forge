// 1.102.0 — le tableau des mesures reçoit le même menu ⋮ que les autres panneaux
// (export CSV, plein écran, fermeture). Ces tests verrouillent l'existence du
// menu dans l'en-tête du tableau, ses trois actions et leur effet : l'export
// envoie le CSV renvoyé par l'API, le plein écran est demandé sur le panneau,
// « Fermer le panneau » retire le tableau.
import { fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MetricsWorkspace } from "@/features/kpi/MetricsWorkspace";
import { downloadCsv } from "@/features/kpi/workspace-model";
import fixture from "./fixtures/metrics-analysis-44621571bccc.json";
import "@/lib/i18n";

vi.mock("@/lib/api/client", async () => {
  const data = (await import("./fixtures/metrics-analysis-44621571bccc.json")).default;
  return {
    getMetricAnalysis: vi.fn().mockResolvedValue(data),
    getMetricCaptures: vi
      .fn()
      .mockResolvedValue([
        { capture_id: "44621571bccc", label: "M1_FREE_DL-7Go_Max-10_W30_26Jun23_103320.4.nmf" },
      ]),
    getCaptureEvents: vi.fn().mockResolvedValue({ events: [] }),
  };
});

// L'export doit passer par le téléchargement partagé du workspace, avec le CSV
// du serveur — pas par une reconstruction locale des lignes affichées.
vi.mock("@/features/kpi/workspace-model", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/features/kpi/workspace-model")>();
  return { ...mod, downloadCsv: vi.fn() };
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

async function openMenu() {
  mount();
  const panel = await screen.findByTestId("metrics-table-panel");
  const trigger = within(panel).getByTestId("workspace-panel-menu");
  // jsdom ne connaît pas les pointeurs de Radix : le menu s'ouvre au clavier.
  fireEvent.keyDown(trigger, { key: "Enter" });
  return panel;
}

describe("MetricsWorkspace — menu ⋮ du tableau des mesures", () => {
  it("l'en-tête du tableau expose un ⋮ avec Export CSV, Plein écran et Fermer", async () => {
    const panel = await openMenu();
    const exportItem = await screen.findByTestId("metrics-table-export");
    expect(within(panel).getByTestId("metrics-table-close")).toBeInTheDocument();
    expect(exportItem).toHaveAttribute("aria-disabled", "false");
    expect(exportItem.textContent).toMatch(/CSV/);
    expect(screen.getByTestId("metrics-table-fullscreen")).toBeInTheDocument();
    expect(screen.getByTestId("metrics-table-remove")).toBeInTheDocument();
  });

  it("Export CSV télécharge le fichier renvoyé par l'API", async () => {
    await openMenu();
    fireEvent.click(await screen.findByTestId("metrics-table-export"));
    expect(vi.mocked(downloadCsv)).toHaveBeenCalledWith(fixture.csv, "metrics_44621571bccc");
  });

  it("Plein écran est demandé sur le panneau du tableau", async () => {
    const requestFullscreen = vi.fn();
    HTMLElement.prototype.requestFullscreen = requestFullscreen;
    const panel = await openMenu();
    fireEvent.click(await screen.findByTestId("metrics-table-fullscreen"));
    expect(requestFullscreen).toHaveBeenCalled();
    expect(panel).toBeInTheDocument();
  });

  it("« Fermer le panneau » retire le tableau des mesures", async () => {
    await openMenu();
    fireEvent.click(await screen.findByTestId("metrics-table-remove"));
    await waitFor(() =>
      expect(screen.queryByTestId("metrics-table-panel")).not.toBeInTheDocument(),
    );
  });
});
