// Graph panels must not offer a drag-to-move handle: ordering lives in the
// workspace settings popup instead.
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import "@/lib/i18n";
import { PanelGridContext, PanelShell } from "@/features/kpi/PanelShell";

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

  it("shows no floating tool bar above a graph panel", () => {
    const { container } = render(
      <PanelGridContext.Provider value={{ cols: 3 }}>
        <PanelShell workspaceId="tools-test" id="graph" natural={0} defaultTitle="graph">
          {() => <div>chart</div>}
        </PanelShell>
      </PanelGridContext.Provider>,
    );
    expect(container.querySelector(".kpi-panel-tools")).toBeNull();
    expect(screen.queryByRole("button", { name: "Panel width" })).toBeNull();
  });
});
