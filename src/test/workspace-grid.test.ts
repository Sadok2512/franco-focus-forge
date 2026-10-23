import { describe, expect, it } from "vitest";
import { effectivePanelSpan, panelColumns, workspaceColumns } from "@/features/kpi/workspace-grid";

describe("workspace column rules", () => {
  it.each([1, 2, 3] as const)("retains explicit %i columns at all container widths", (cols) => {
    for (const width of [300, 800, 1440]) {
      expect(workspaceColumns(`${cols}`, width, 6)).toBe(cols);
    }
  });
  it("uses available container width for Auto", () => {
    expect(workspaceColumns("auto", 420, 6)).toBe(1);
    expect(workspaceColumns("auto", 855, 6)).toBe(1);
    expect(workspaceColumns("auto", 856, 6)).toBe(2);
    expect(workspaceColumns("auto", 1292, 6)).toBe(3);
    expect(workspaceColumns("auto", 1920, 1)).toBe(1);
  });
  it("clamps saved spans without changing their saved value", () => {
    expect(panelColumns(3, 2)).toBe(2);
    expect(panelColumns(2, 1)).toBe(1);
    expect(panelColumns("full", 3)).toBe(3);
    expect(panelColumns(1, 3)).toBe(1);
  });
  it("keeps every table alone across all columns despite a saved narrow span", () => {
    for (const cols of [1, 2, 3]) {
      expect(effectivePanelSpan(true, 1)).toBe("full");
      expect(panelColumns(effectivePanelSpan(true, 1), cols)).toBe(cols);
    }
    expect(effectivePanelSpan(false, 1)).toBe(1);
  });
});
