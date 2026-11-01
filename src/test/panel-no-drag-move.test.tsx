// Graph panels must not offer a drag-to-move handle: ordering lives in the
// workspace settings popup instead.
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import "@/lib/i18n";
import { PanelGridContext, PanelShell } from "@/features/kpi/PanelShell";
import { loadLayout } from "@/features/kpi/panel-layout";

describe("panel drag-to-move control", () => {
  beforeEach(() => localStorage.clear());

  it("renders no drag handle on a graph panel", () => {
    const { container } = render(
      <PanelGridContext.Provider value={{ cols: 3 }}>
        <PanelShell workspaceId="grip-test" id="graph" natural={0} defaultTitle="graph">
          {() => <div>chart</div>}
        </PanelShell>
      </PanelGridContext.Provider>,
    );

    expect(container.querySelector(".kpi-panel-grip")).toBeNull();
    expect(screen.queryByTitle("Drag to move")).toBeNull();
    expect(container.querySelector("[draggable='true']")).toBeNull();
  });

  it("keeps the remaining panel tools working", () => {
    render(
      <PanelGridContext.Provider value={{ cols: 3 }}>
        <PanelShell workspaceId="tools-test" id="graph" natural={0} defaultTitle="graph">
          {() => <div>chart</div>}
        </PanelShell>
      </PanelGridContext.Provider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Panel width" }));
    expect(loadLayout("tools-test").span["graph"]).toBe(2);
    fireEvent.click(screen.getByRole("button", { name: "Collapse" }));
    expect(loadLayout("tools-test").collapsed["graph"]).toBe(true);
  });
});
