// Workspace settings: edits must stay a draft until "Apply" is clicked.
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceSettingsDialog } from "@/features/kpi/WorkspaceSettingsDialog";
import i18n from "@/lib/i18n";

const WS = "ws-apply-test";
const KEY = `bc4.tableSettings.${WS}`;
const HEADER_BG = i18n.t("wss.color_headerBg");

function openDialog() {
  localStorage.removeItem(KEY);
  render(
    <WorkspaceSettingsDialog
      open
      onOpenChange={vi.fn()}
      workspaceId={WS}
      columns={[{ code: "a", label: "Col A" }]}
    />,
  );
}

const applyBtn = () => screen.getByTestId("workspace-settings-apply");
const colorInput = () => screen.getByLabelText(HEADER_BG) as HTMLInputElement;

describe("workspace settings apply button", () => {
  it("keeps edits unpublished until Apply is clicked", () => {
    openDialog();
    fireEvent.change(colorInput(), { target: { value: "#123456" } });
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(applyBtn()).not.toBeDisabled();
    fireEvent.click(applyBtn());
    expect(JSON.parse(localStorage.getItem(KEY)!).colors.headerBg).toBe("#123456");
    expect(applyBtn()).toBeDisabled();
  });

  it("discards unapplied edits when the popup is closed", () => {
    openDialog();
    fireEvent.change(colorInput(), { target: { value: "#abcdef" } });
    fireEvent.click(screen.getByRole("button", { name: i18n.t("wss.cancel") }));
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
