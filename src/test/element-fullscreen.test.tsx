import { describe, expect, it, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { useElementFullscreen } from "@/lib/element-fullscreen";

function Probe() {
  const fs = useElementFullscreen<HTMLDivElement>();
  return (
    <div ref={fs.ref} data-testid="panel">
      <button type="button" data-testid="toggle" onClick={() => void fs.toggle()}>
        {fs.active ? "on" : "off"}
      </button>
    </div>
  );
}

describe("useElementFullscreen", () => {
  beforeEach(() => {
    // jsdom has no Fullscreen API; stub it against document.fullscreenElement.
    let current: Element | null = null;
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => current,
    });
    Element.prototype.requestFullscreen = async function (this: Element) {
      current = this;
      document.dispatchEvent(new Event("fullscreenchange"));
    };
    document.exitFullscreen = async () => {
      current = null;
      document.dispatchEvent(new Event("fullscreenchange"));
    };
  });

  it("enters fullscreen on the panel element and exits on second toggle", async () => {
    render(<Probe />);
    const panel = screen.getByTestId("panel");
    const toggle = screen.getByTestId("toggle");

    expect(toggle.textContent).toBe("off");
    await act(async () => {
      toggle.click();
    });
    expect(document.fullscreenElement).toBe(panel);
    expect(toggle.textContent).toBe("on");

    await act(async () => {
      toggle.click();
    });
    expect(document.fullscreenElement).toBeNull();
    expect(toggle.textContent).toBe("off");
  });

  it("tracks an external exit (Escape) via fullscreenchange", async () => {
    render(<Probe />);
    const toggle = screen.getByTestId("toggle");
    await act(async () => {
      toggle.click();
    });
    expect(toggle.textContent).toBe("on");
    await act(async () => {
      await document.exitFullscreen();
    });
    expect(toggle.textContent).toBe("off");
  });
});
