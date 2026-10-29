import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeleteCaptureDialog } from "@/features/projects/DeleteCaptureDialog";
import { NmfFileReportSchema } from "@/lib/api/nmf-schemas";
import { setLanguage } from "@/lib/i18n";

const legacyFile = {
  filename: "TEST-capture.nmf",
  status: "done" as const,
  n_captures: 1,
  n_events: 2,
  n_gps: 1,
  decoder_version: "TEST-decoder",
  error_msg: null,
};

afterEach(async () => {
  cleanup();
  await setLanguage("en");
});

describe("capture deletion contract", () => {
  it("accepts legacy reports and exposes backend capture ids when present", () => {
    expect(NmfFileReportSchema.parse(legacyFile).capture_ids).toBeUndefined();
    expect(
      NmfFileReportSchema.parse({ ...legacyFile, capture_ids: ["a4b0c321c52e"] }).capture_ids,
    ).toEqual(["a4b0c321c52e"]);
  });

  it("requires a traced reason before confirming", async () => {
    await act(async () => setLanguage("fr"));
    const onConfirm = vi.fn();
    render(
      <DeleteCaptureDialog
        open
        filename="TEST-capture.nmf"
        captureId="a4b0c321c52e"
        busy={false}
        error={null}
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    const action = screen.getByRole("button", { name: "Supprimer" });
    expect(action).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Motif"), { target: { value: "court" } });
    expect(action).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Motif"), {
      target: { value: "TEST suppression confirmée" },
    });
    expect(action).toBeEnabled();
    fireEvent.click(action);
    expect(onConfirm).toHaveBeenCalledWith("TEST suppression confirmée");
  });
});
