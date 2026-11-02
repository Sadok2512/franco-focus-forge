// Graph panels must not offer a drag-to-move handle: ordering lives in the
// workspace settings popup instead.
import { fireEvent, render, screen } from "@testing-library/react";
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

  it.each([
    ["histogram", false],
    ["map", true],
  ] as const)("resizes and persists the %s panel height", (kind, bare) => {
    const { container } = render(
      <PanelGridContext.Provider value={{ cols: 3 }}>
        <PanelShell
          workspaceId="resize-test"
          id={kind}
          natural={0}
          defaultTitle={kind}
          bare={bare}
        >
          {() => <div>{kind}</div>}
        </PanelShell>
      </PanelGridContext.Provider>,
    );

    const shell = container.querySelector<HTMLElement>(`[data-panel-id='${kind}']`)!;
    shell.getBoundingClientRect = () => ({ height: 300 }) as DOMRect;
    const handle = shell.querySelector<HTMLElement>(".kpi-panel-resize");
    expect(handle).not.toBeNull();

    // jsdom does not expose PointerEvent; MouseEvent still carries the
    // coordinates through the pointer event names used by the component.
    fireEvent(handle!, new MouseEvent("pointerdown", { bubbles: true, clientY: 100 }));
    fireEvent(window, new MouseEvent("pointermove", { bubbles: true, clientY: 180 }));
    fireEvent(window, new MouseEvent("pointerup", { bubbles: true, clientY: 180 }));

    expect(shell.style.height).toBe("380px");
    expect(JSON.parse(localStorage.getItem("bc4.panelLayout.resize-test") ?? "{}").height[kind])
      .toBe(380);
  });
});
