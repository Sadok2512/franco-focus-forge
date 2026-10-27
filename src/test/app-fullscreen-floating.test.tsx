import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useAppFullscreen } from "@/lib/app-fullscreen";

function Probe() {
  return <span data-testid="state">{String(useAppFullscreen())}</span>;
}

const setFullscreen = (on: boolean) => {
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    value: on ? document.documentElement : null,
  });
  act(() => document.dispatchEvent(new Event("fullscreenchange")));
};

beforeEach(() => {
  Object.defineProperty(document, "fullscreenEnabled", { configurable: true, value: true });
  setFullscreen(false);
});
afterEach(() => {
  cleanup();
  setFullscreen(false);
});

describe("floating header contract", () => {
  it("marks the document so the header floats and the page reclaims its height", () => {
    render(<Probe />);
    expect(screen.getByTestId("state")).toHaveTextContent("false");
    expect(document.documentElement).not.toHaveClass("app-fullscreen");

    setFullscreen(true);
    expect(screen.getByTestId("state")).toHaveTextContent("true");
    expect(document.documentElement).toHaveClass("app-fullscreen");
  });

  it("follows a silent exit (browser Escape) so the header stops floating", () => {
    render(<Probe />);
    setFullscreen(true);
    expect(document.documentElement).toHaveClass("app-fullscreen");

    setFullscreen(false);
    expect(screen.getByTestId("state")).toHaveTextContent("false");
    expect(document.documentElement).not.toHaveClass("app-fullscreen");
  });

  it("keeps two mounted readers in sync", () => {
    render(
      <>
        <Probe />
        <Probe />
      </>,
    );
    setFullscreen(true);
    expect(screen.getAllByTestId("state").map((n) => n.textContent)).toEqual(["true", "true"]);
  });
});
