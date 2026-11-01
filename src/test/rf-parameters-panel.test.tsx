import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@/lib/i18n";
import { RfParametersPanel } from "@/features/kpi/RfParametersPanel";
import { bearingDeg } from "@/features/kpi/map-rf-panel";

const base = { seq: 621, tRelS: 3008.034, metricLabel: "RSRP", unit: "dBm", neighbours: [] };

describe("RF Parameters tab", () => {
  it("shows missing radio identity as N/D, never as zero or inferred CA", () => {
    render(<RfParametersPanel details={{ ...base, value: -96.4 }} onClose={vi.fn()} />);
    const panel = screen.getByTestId("rf-parameters-panel");
    expect(panel.textContent).toContain("-96.4 dBm");
    expect(panel.textContent).toContain("00:50:08.034");
    expect(panel.textContent).not.toMatch(/\b\dCC\b/);
    expect(panel.textContent).toContain("N/D");
  });

  it("highlights the active map metric among the point metrics", () => {
    render(
      <RfParametersPanel
        details={{ ...base, value: null }}
        metrics={[{ label: "LTE DL BLER", unit: "%", value: 2.1, active: true }]}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("2.1 %").closest("div")?.className).toContain("bg-primary/10");
  });

  it("computes UE → site azimuth from real coordinates", () => {
    expect(Math.round(bearingDeg([2, 50], [2, 51]))).toBe(0);
    expect(Math.round(bearingDeg([2, 50], [3, 50]))).toBe(90);
  });
});
