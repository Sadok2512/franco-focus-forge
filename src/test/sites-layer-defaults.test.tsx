import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useSitesLayerState } from "@/features/kpi/SitesLayerControls";

function Probe() {
  const state = useSitesLayerState();
  return <output>{`${state.enabled}:${state.cellsEnabled}`}</output>;
}

describe("shared map layer defaults", () => {
  it("starts Sites and Cells ON when no preference exists", () => {
    localStorage.removeItem("bc4.map.sitesLayer.v4");
    render(<Probe />);
    expect(screen.getByText("true:true")).toBeInTheDocument();
  });

  it("keeps an explicit user choice while defaulting missing legacy fields ON", () => {
    localStorage.setItem("bc4.map.sitesLayer.v4", JSON.stringify({ cellsEnabled: false }));
    render(<Probe />);
    expect(screen.getByText("true:false")).toBeInTheDocument();
  });
});
