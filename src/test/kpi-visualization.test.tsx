import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KpiChartSettings } from "@/features/kpi/KpiChartSettings";
import { defaultConfig } from "@/features/kpi/visualization-model";

afterEach(cleanup);
describe("KPI chart configuration", () => {
  it("keeps axis drafts local until Apply and preserves the KPI identity", () => {
    const onApply = vi.fn(),
      onCancel = vi.fn();
    const config = { ...defaultConfig("TEST_KPI", "operator_band"), statistic: "p50" as const };
    render(
      <KpiChartSettings
        config={config}
        name="TEST KPI"
        unit="dBm"
        groupOptions={["operator", "band", "operator_band"]}
        choices={["p10", "p50"]}
        onApply={onApply}
        onCancel={onCancel}
      />,
    );
    fireEvent.change(screen.getByLabelText("Axe X"), { target: { value: "band" } });
    expect(onApply).not.toHaveBeenCalled();
    expect(config.groupBy).toBe("operator_band");
    fireEvent.click(screen.getByText("Appliquer", { exact: true }));
    expect(onApply).toHaveBeenCalledWith({ ...config, groupBy: "band", xMetric: "band" });
    expect(screen.getByLabelText("Axe Y")).toBeDisabled();
    expect(screen.queryByRole("option", { name: /Task Time|RSRP|Moyenne|P90/ })).toBeNull();
  });
  it("Cancel does not apply a draft or change another KPI configuration", () => {
    const first = defaultConfig("TEST_FIRST", "operator"),
      second = defaultConfig("TEST_SECOND", "band");
    const onApply = vi.fn(),
      onCancel = vi.fn();
    render(
      <KpiChartSettings
        config={first}
        name="TEST FIRST"
        unit="occurrences"
        groupOptions={["operator", "band"]}
        choices={[]}
        onApply={onApply}
        onCancel={onCancel}
      />,
    );
    fireEvent.change(screen.getByLabelText("Regroupement du graphique"), {
      target: { value: "band" },
    });
    fireEvent.click(screen.getByText("Annuler"));
    expect(onApply).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledOnce();
    expect(first.groupBy).toBe("operator");
    expect(second).toEqual(defaultConfig("TEST_SECOND", "band"));
    expect(screen.getByLabelText("Statistique du graphique")).toBeDisabled();
  });
});
