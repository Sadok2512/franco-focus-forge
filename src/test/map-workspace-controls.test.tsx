import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import "@/lib/i18n";
import { NetworkMapChrome as SitesMapWorkspaceControls } from "@/features/kpi/NetworkMapChrome";
import { DEFAULT_NETWORK_MAP_CENTER, resolveNetworkMapCenter } from "@/features/map/map-center";

describe("Map workspace chrome", () => {
  it("does not open a legacy project with a [0, 0] sentinel outside the sites perimeter", () => {
    expect(resolveNetworkMapCenter([0, 0])).toEqual(DEFAULT_NETWORK_MAP_CENTER);
    expect(resolveNetworkMapCenter(undefined)).toEqual(DEFAULT_NETWORK_MAP_CENTER);
    expect(resolveNetworkMapCenter([2.35, 48.86])).toEqual([2.35, 48.86]);
  });

  it("renders functional top controls and API-backed bottom status", () => {
    const toggleSites = vi.fn();
    const toggleCells = vi.fn();
    const toggleTechno = vi.fn();
    render(
      <SitesMapWorkspaceControls
        enabled
        cellsEnabled
        cellsAvailable
        filters={{ technos: [], bands: [], operators: [] }}
        onToggleEnabled={toggleSites}
        onToggleCells={toggleCells}
        onToggleTechno={toggleTechno}
        onToggleBand={() => {}}
        onToggleOperator={() => {}}
        onReset={() => {}}
        status={{ loading: false, error: null, zoom: 13, n_sites: 619, n_cells: 341 }}
      />,
    );

    expect(screen.getByTestId("map-workspace-topbar")).toBeInTheDocument();
    expect(screen.getByTestId("map-workspace-statusbar")).toHaveTextContent("619");
    expect(screen.getByTestId("map-workspace-statusbar")).toHaveTextContent("341");
    fireEvent.click(screen.getByRole("button", { name: "Sites" }));
    fireEvent.click(screen.getByRole("button", { name: "Cells" }));
    fireEvent.click(screen.getByRole("button", { name: "LTE" }));
    expect(toggleSites).toHaveBeenCalledWith(false);
    expect(toggleCells).toHaveBeenCalledWith(false);
    expect(toggleTechno).toHaveBeenCalledWith("LTE");
  });

  it("disables the cell layer below zoom 13", () => {
    render(
      <SitesMapWorkspaceControls
        enabled
        cellsEnabled
        cellsAvailable={false}
        filters={{ technos: [], bands: [], operators: [] }}
        onToggleEnabled={() => {}}
        onToggleCells={() => {}}
        onToggleTechno={() => {}}
        onToggleBand={() => {}}
        onToggleOperator={() => {}}
        status={{ loading: false, error: null, zoom: 12, n_sites: 25 }}
      />,
    );
    expect(screen.getByRole("button", { name: "Cells" })).toBeDisabled();
  });
});
