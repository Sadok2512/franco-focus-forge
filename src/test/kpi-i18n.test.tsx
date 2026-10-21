import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { setLanguage } from "@/lib/i18n";
import { KpiChartSettings } from "@/features/kpi/KpiChartSettings";
import { defaultConfig, GROUP_LABELS, VISUALIZATIONS } from "@/features/kpi/visualization-model";
import { formatValue } from "@/features/kpi/workspace-model";
import { FilterSelect } from "@/features/dict-v2/FilterSelect";

afterEach(async () => {
  cleanup();
  await setLanguage("en");
});
it("switches chart controls and dynamic labels without losing an unapplied axis draft", async () => {
  await setLanguage("en");
  const onApply = vi.fn();
  render(
    <KpiChartSettings
      config={defaultConfig("TEST_KPI", "operator")}
      name="TEST KPI"
      unit="dBm"
      groupOptions={["operator", "band"]}
      choices={["value"]}
      onApply={onApply}
      onCancel={() => {}}
    />,
  );
  fireEvent.change(screen.getByLabelText("X axis"), { target: { value: "band" } });
  expect(onApply).not.toHaveBeenCalled();
  await act(async () => {
    await setLanguage("fr");
  });
  expect(screen.getByLabelText("Axe X")).toHaveValue("band");
  expect(onApply).not.toHaveBeenCalled();
  expect(GROUP_LABELS.operator).toBe("Opérateur");
  expect(VISUALIZATIONS.table).toBe("Tableau");
  expect(formatValue(1234.5)).toBe(
    new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }).format(1234.5),
  );
  await act(async () => {
    await setLanguage("en");
  });
  expect(screen.getByLabelText("X axis")).toHaveValue("band");
  fireEvent.click(screen.getByRole("button", { name: "Apply", exact: true }));
  expect(onApply).toHaveBeenCalledOnce();
  expect(onApply).toHaveBeenCalledWith(
    expect.objectContaining({ kpiCode: "TEST_KPI", groupBy: "band" }),
  );
  expect(VISUALIZATIONS.table).toBe("Table");
});
it("language changes preserve an explicit empty operator population", async () => {
  await setLanguage("en");
  const change = vi.fn();
  render(
    <FilterSelect
      label="TEST operator"
      options={["TEST-A", "TEST-B"]}
      value={[]}
      explicitSelection
      unrestricted={false}
      onChange={change}
    />,
  );
  expect(screen.getByRole("button", { name: "TEST operator — None" })).toBeInTheDocument();
  await act(async () => {
    await setLanguage("fr");
  });
  expect(screen.getByRole("button", { name: "TEST operator — Aucun" })).toBeInTheDocument();
  expect(change).not.toHaveBeenCalled();
});
