import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TimeNavigator } from "@/features/signaling/TimeNavigator";
import "@/lib/i18n";

describe("Navigator independent edge controls", () => {
  afterEach(cleanup);
  it("keyboard-resizes the start without panning the window", () => {
    const onWindow = vi.fn();
    render(<TimeNavigator duration={546.905} window={[120, 150]} onWindow={onWindow} />);
    fireEvent.keyDown(screen.getByTestId("time-navigator-start"), { key: "ArrowRight" });
    expect(onWindow).toHaveBeenCalledExactlyOnceWith([120.1, 150]);
  });
  it("keyboard-resizes the end without panning the window", () => {
    const onWindow = vi.fn();
    render(<TimeNavigator duration={546.905} window={[120, 150]} onWindow={onWindow} />);
    fireEvent.keyDown(screen.getByTestId("time-navigator-end"), { key: "ArrowLeft" });
    expect(onWindow).toHaveBeenCalledExactlyOnceWith([120, 149.9]);
  });
  it("moves a 30-second window forward without changing its size", () => {
    const onWindow = vi.fn();
    render(<TimeNavigator duration={546.905} window={[120, 150]} onWindow={onWindow} />);
    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowRight" });
    expect(onWindow).toHaveBeenCalledExactlyOnceWith([150, 180]);
  });
  it("keeps a full-capture window within capture bounds", () => {
    const onWindow = vi.fn();
    render(<TimeNavigator duration={546.905} window={[0, 546.905]} onWindow={onWindow} />);
    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowRight" });
    expect(onWindow).toHaveBeenCalledExactlyOnceWith([0, 546.905]);
  });
});