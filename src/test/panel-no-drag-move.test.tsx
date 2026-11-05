// Every visual panel shares the same move and bidirectional resize controls.
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import "@/lib/i18n";
import { PanelGridContext, PanelShell } from "@/features/kpi/PanelShell";
import { loadLayout } from "@/features/kpi/panel-layout";

describe("panel drag-to-move control", () => {
  beforeEach(() => localStorage.clear());

  it("renders a common drag handle on a graph panel", () => {
    const { container } = render(
      <PanelGridContext.Provider value={{ cols: 3 }}>
        <PanelShell workspaceId="grip-test" id="graph" natural={0} defaultTitle="graph">
          {() => <div>chart</div>}
        </PanelShell>
      </PanelGridContext.Provider>,
    );

    expect(container.querySelector(".kpi-panel-grip")).not.toBeNull();
    expect(screen.getByTitle("Drag to exchange panel position")).toBeVisible();
    expect(container.querySelector("[draggable='true']")).toBeNull();
  });

  it("exchanges two panels by dragging the common handle", () => {
    const { container } = render(
      <div className="kpi-graph-grid">
        <PanelGridContext.Provider value={{ cols: 3 }}>
          <PanelShell workspaceId="exchange-test" id="timeline" natural={0} defaultTitle="Timeline">
            {() => <div>timeline</div>}
          </PanelShell>
          <PanelShell workspaceId="exchange-test" id="l3" natural={1} defaultTitle="L3">
            {() => <div>L3</div>}
          </PanelShell>
        </PanelGridContext.Provider>
      </div>,
    );
    const timeline = container.querySelector<HTMLElement>("[data-panel-id='timeline']")!;
    const l3 = container.querySelector<HTMLElement>("[data-panel-id='l3']")!;
    const originalElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = () => l3;
    fireEvent(
      timeline.querySelector(".kpi-panel-grip")!,
      new MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 }),
    );
    fireEvent(window, new MouseEvent("pointermove", { bubbles: true }));
    fireEvent(window, new MouseEvent("pointerup", { bubbles: true }));
    document.elementFromPoint = originalElementFromPoint;

    expect(loadLayout("exchange-test").order).toEqual(["l3", "timeline"]);
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
        <PanelShell workspaceId="resize-test" id={kind} natural={0} defaultTitle={kind} bare={bare}>
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
    expect(
      JSON.parse(localStorage.getItem("bc4.panelLayout.resize-test") ?? "{}").height[kind],
    ).toBe(380);
  });

  it.each(["radio-snapshot", "signaling:timeline", "signaling:l3"])(
    "resizes and persists both axes for %s",
    (id) => {
      const { container } = render(
        <div className="kpi-graph-grid" data-testid="grid">
          <PanelGridContext.Provider value={{ cols: 3 }}>
            <PanelShell workspaceId="both-axes" id={id} natural={0} defaultTitle={id}>
              {() => <div>panel</div>}
            </PanelShell>
          </PanelGridContext.Provider>
        </div>,
      );

      const grid = screen.getByTestId("grid");
      grid.getBoundingClientRect = () => ({ width: 932 }) as DOMRect;
      const shell = container.querySelector<HTMLElement>(`[data-panel-id='${id}']`)!;
      shell.getBoundingClientRect = () => ({ width: 300, height: 300 }) as DOMRect;
      const handle = shell.querySelector<HTMLElement>(".kpi-panel-resize")!;

      fireEvent(
        handle,
        new MouseEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          clientX: 300,
          clientY: 100,
        }),
      );
      fireEvent(
        window,
        new MouseEvent("pointermove", {
          bubbles: true,
          clientX: 630,
          clientY: 180,
        }),
      );
      fireEvent(
        window,
        new MouseEvent("pointerup", {
          bubbles: true,
          clientX: 630,
          clientY: 180,
        }),
      );

      const saved = loadLayout("both-axes");
      expect(shell.style.height).toBe("380px");
      expect(shell.style.gridColumn).toBe("span 2");
      expect(saved.height[id]).toBe(380);
      expect(saved.span[id]).toBe(2);
    },
  );

  it("measures the workspace grid through a display-contents metric wrapper", () => {
    const { container } = render(
      <div className="kpi-graph-grid" data-testid="wrapped-grid">
        <section style={{ display: "contents" }}>
          <PanelGridContext.Provider value={{ cols: 3 }}>
            <PanelShell
              workspaceId="wrapped-resize"
              id="radio-snapshot"
              natural={0}
              defaultTitle="snapshot"
            >
              {() => <div>snapshot</div>}
            </PanelShell>
          </PanelGridContext.Provider>
        </section>
      </div>,
    );
    const grid = screen.getByTestId("wrapped-grid");
    grid.getBoundingClientRect = () => ({ width: 932 }) as DOMRect;
    const shell = container.querySelector<HTMLElement>("[data-panel-id='radio-snapshot']")!;
    shell.getBoundingClientRect = () => ({ width: 300, height: 300 }) as DOMRect;
    const handle = shell.querySelector<HTMLElement>(".kpi-panel-resize")!;

    fireEvent(
      handle,
      new MouseEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        clientX: 300,
        clientY: 100,
      }),
    );
    fireEvent(
      window,
      new MouseEvent("pointermove", {
        bubbles: true,
        clientX: 630,
        clientY: 100,
      }),
    );
    fireEvent(
      window,
      new MouseEvent("pointerup", {
        bubbles: true,
        clientX: 630,
        clientY: 100,
      }),
    );

    expect(loadLayout("wrapped-resize").span["radio-snapshot"]).toBe(2);
  });
});
