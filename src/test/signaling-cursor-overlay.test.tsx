import { act, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ECharts } from "echarts";
import { TimeCursor } from "@/features/signaling/TimeCursor";

describe("Signaling cursor chart readiness", () => {
  afterEach(() => vi.unstubAllGlobals());
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
      isDisposed: vi.fn(() => false),
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
        series={[
          { code: "cell_rsrp", label: "RSRP", unit: "dBm", points: [{ t_rel_s: 0, value: -99.3, seq: 1 }] },
          { code: "cell_rsrq", label: "RSRQ", unit: "dB", points: [] },
        ] as never}
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
    expect(screen.queryByTestId("time-cursor-tooltip")).toBeNull();
    fireEvent.pointerDown(screen.getByRole("slider"));
    expect(screen.queryByTestId("time-cursor-tooltip")).toBeNull();
    expect(onTime).not.toHaveBeenCalled();
    expect(screen.getByTestId("rf-readout-cell_rsrp").textContent).toContain("-99.3 dBm");
    expect(screen.getByTestId("rf-readout-cell_rsrq").textContent).not.toMatch(/\b0\b/);
    result.unmount();
    expect(chart.off).toHaveBeenCalledWith("finished", finished);
    vi.unstubAllGlobals();
  });

  it("does not convert RF observations before the RF axes exist or after disposal", () => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    const host = createRef<HTMLDivElement>();
    host.current = document.createElement("div");
    let disposed = false;
    let option: Record<string, unknown> = {};
    const convertToPixel = vi.fn((finder: { xAxisIndex: number }) => {
      if (!option["xAxis"] || disposed)
        throw new TypeError("Cannot read properties of undefined (reading 'queryComponents')");
      return finder.xAxisIndex === 1 ? [150, 320] : 150;
    });
    const chart = {
      isDisposed: () => disposed,
      getOption: () => option,
      convertToPixel,
      on: vi.fn(), off: vi.fn(),
    } as unknown as ECharts;
    const props = {
      chart, host, selectedTime: 20, eventId: null, events: [],
      series: [{ code: "cell_rsrp", label: "RSRP", unit: "dBm", points: [{ seq: 1, t_rel_s: 10, value: -90 }] }],
      zoom: [0, 100] as [number, number], duration: 300,
      onTime: vi.fn(), onMessage: vi.fn(),
    };
    const result = render(<TimeCursor {...props} />);
    expect(convertToPixel).not.toHaveBeenCalled();
    option = { xAxis: [{}], yAxis: [{}] };
    result.rerender(<TimeCursor {...props} />);
    expect(convertToPixel.mock.calls.every(([finder]) => finder.xAxisIndex === 0)).toBe(true);
    option = { xAxis: [{}, {}], yAxis: [{}, {}] };
    result.rerender(<TimeCursor {...props} />);
    expect(convertToPixel).toHaveBeenCalledWith({ seriesId: "cell_rsrp" }, [10, -90]);
    disposed = true;
    convertToPixel.mockClear();
    result.rerender(<TimeCursor {...props} />);
    expect(convertToPixel).not.toHaveBeenCalled();
    result.unmount();
  });
});
