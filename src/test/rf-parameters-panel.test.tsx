import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@/lib/i18n";
import { RfParametersPanel } from "@/features/kpi/RfParametersPanel";
import { bearingDeg } from "@/features/kpi/map-rf-panel";

const base = { seq: 621, tRelS: 3008.034, metricLabel: "RSRP", unit: "dBm", neighbours: [] };

describe("RF Parameters tab", () => {
  it("rounds RSRP to 2 decimals and hides empty radio/serving sections", () => {
    render(<RfParametersPanel details={{ ...base, value: -96.4 }} onClose={vi.fn()} />);
    const panel = screen.getByTestId("rf-parameters-panel");
    // RSRP rounded (never a 15-digit float trail like -82.94999999999999).
    expect(panel.textContent).toContain("-96.40 dBm");
    expect(panel.textContent).not.toMatch(/\.\d{3,}\s*dBm/);
    expect(panel.textContent).toContain("00:50:08.034");
    // No inferred/zero CA leaking through as a band/channel/CA value.
    expect(panel.textContent).not.toMatch(/\b\dCC\b/);
    // Empty "Radio information" and "Serving cell" sections are omitted
    // rather than rendered as a wall of N/D rows (user feedback 2026-11-02).
    expect(panel.textContent).not.toContain("Bandwidth");
    expect(panel.textContent).not.toContain("No serving cell");
    // Position still reads N/D when the caller doesn't pass it — rows that
    // legitimately miss data still signal absence via N/D, we only drop
    // whole sections that would otherwise be N/D top-to-bottom.
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
