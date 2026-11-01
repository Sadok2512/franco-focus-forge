import { useContext } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import "@/lib/i18n";
import { MapPanelWidthContext, PanelGridContext, PanelShell } from "@/features/kpi/PanelShell";
import { loadLayout } from "@/features/kpi/panel-layout";

function WidthControl() {
  const width = useContext(MapPanelWidthContext);
  return <button onClick={width?.toggle} aria-pressed={width?.wide}>width</button>;
}
describe("map horizontal size", () => {
  beforeEach(() => localStorage.clear());
  it("widens only its map panel to the available grid width and restores one column", () => {
    render(<PanelGridContext.Provider value={{ cols: 3 }}><PanelShell workspaceId="width-test" id="map" natural={0} defaultTitle="map" bare>{() => <WidthControl />}</PanelShell></PanelGridContext.Provider>);
    fireEvent.click(screen.getByRole("button", { name: "width" }));
    expect(loadLayout("width-test").span.map).toBe(3);
    expect(loadLayout("width-test").span.other).toBeUndefined();
    fireEvent.click(screen.getByRole("button", { name: "width" }));
    expect(loadLayout("width-test").span.map).toBe(1);
  });
});