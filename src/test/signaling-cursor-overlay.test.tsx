import { act, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ECharts } from "echarts";
import { TimeCursor } from "@/features/signaling/TimeCursor";

describe("Signaling cursor chart readiness", () => {
  it("resolves capture time zero after axes become ready without mouse movement", () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    const host = createRef<HTMLDivElement>();
    host.current = document.createElement("div");
    let ready = false;
    let finished: (() => void) | undefined;
    const chart = {
      on: vi.fn((name: string, callback: () => void) => {
        if (name === "finished") finished = callback;
      }),
      off: vi.fn(),
      getOption: vi.fn(() => (ready ? { xAxis: [{}] } : {})),
      convertToPixel: vi.fn((_axis: unknown, time: number) => (ready ? 112 + time : NaN)),
    } as unknown as ECharts;
    const onTime = vi.fn();
    const result = render(
      <TimeCursor
        chart={chart}
        host={host}
        selectedTime={0}
        eventId={null}
        events={[]}
        series={[]}
        zoom={[0, 100]}
        duration={300}
        onTime={onTime}
        onMessage={vi.fn()}
      />,
    );
    expect(screen.queryByRole("slider")).toBeNull();
    act(() => {
      ready = true;
      finished?.();
    });
    expect(screen.getByRole("slider").getAttribute("aria-valuenow")).toBe("0");
    expect(onTime).not.toHaveBeenCalled();
    result.unmount();
    expect(chart.off).toHaveBeenCalledWith("finished", finished);
    vi.unstubAllGlobals();
  });
});
