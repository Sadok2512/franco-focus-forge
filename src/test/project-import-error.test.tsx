import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProjectRowNmfAction } from "@/features/projects/ProjectRowNmfAction";
import { uploadNmfFiles } from "@/lib/api/client";
import { ApiHttpError } from "@/lib/api/http";

vi.mock("@/lib/api/client", () => ({ uploadNmfFiles: vi.fn() }));

describe("Project import errors", () => {
  it("passes the current request error to the project row after an asynchronous rejection", async () => {
    let rejectUpload!: (reason: Error) => void;
    vi.mocked(uploadNmfFiles).mockReturnValueOnce(new Promise((_resolve, reject) => {
      rejectUpload = reject;
    }));
    const onError = vi.fn();
    const onReport = vi.fn();
    const { container } = render(
      <ProjectRowNmfAction projectId="test" projectName="Test" onError={onError} onReport={onReport} />,
    );
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [new File(["test"], "test.nmf")] },
    });
    rejectUpload(new ApiHttpError("GATEWAY_TIMEOUT", "Délai dépassé", 504));
    await waitFor(() => expect(onError).toHaveBeenCalledWith("HTTP 504 — Délai dépassé"));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onReport).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveAttribute("title", "HTTP 504 — Délai dépassé");
  });
});
