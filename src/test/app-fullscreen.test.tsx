import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppFullscreenButton } from "@/components/bc4/AppFullscreenButton";
import "@/lib/i18n";

const request = vi.fn();
const exit = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(document, "fullscreenEnabled", { configurable: true, value: true });
  Object.defineProperty(document, "fullscreenElement", { configurable: true, value: null });
  Object.defineProperty(document.documentElement, "requestFullscreen", { configurable: true, value: request });
  Object.defineProperty(document, "exitFullscreen", { configurable: true, value: exit });
  request.mockResolvedValue(undefined);
  exit.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe("app-wide fullscreen", () => {
  it("requests fullscreen on the whole document, not a page panel", async () => {
    render(<AppFullscreenButton />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(request).toHaveBeenCalledOnce());
    expect(request.mock.contexts[0]).toBe(document.documentElement);
  });

  it("exits fullscreen and follows browser Escape changes", async () => {
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: document.documentElement });
    render(<AppFullscreenButton />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(exit).toHaveBeenCalledOnce());
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: null });
    fireEvent(document, new Event("fullscreenchange"));
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false");
  });

  it("handles browser refusal without losing the normal view", async () => {
    request.mockRejectedValue(new Error("Blocked"));
    render(<AppFullscreenButton />);
    fireEvent.click(screen.getByRole("button"));
    await screen.findByRole("alert");
    expect(screen.getByRole("button")).toBeEnabled();
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false");
  });
});