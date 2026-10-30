import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CellularReferencePanel } from "@/features/settings/cellular-reference/CellularReferencePanel";
import { ApiHttpError } from "@/lib/api/http";
import "@/lib/i18n";

const api = vi.hoisted(() => ({
  getCellSummary: vi.fn(),
  listCellImports: vi.fn(),
  uploadCellReference: vi.fn(),
}));

vi.mock("@/lib/api/client", () => api);

const report = {
  rows_read: 459_547,
  rows_loaded: 458_211,
  rows_rejected: 1_336,
  rejected_by_reason: { invalid: 1_336 },
  distinct_eci: 300_000,
  distinct_nci: 158_211,
  by_rat: { LTE: 300_000, NR: 158_211 },
  bands_unmapped: {},
  etat_breakdown: { OPERATIONAL: 458_211 },
  arcep_breakdown: { "01/ Top15": 458_211 },
  snapshot_date: "2026-06-06",
};

const summary = {
  total: 458_211,
  by_rat: [],
  by_band_3gpp: [],
  by_dor: [],
  by_dr: [],
  arcep_breakdown: [],
};

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CellularReferencePanel />
    </QueryClientProvider>,
  );
}

function selectFile() {
  const input = screen.getByLabelText("Fichier CSV");
  const file = new File(["id,rat\n1,LTE\n"], "ref_cell_4G5G.csv", { type: "text/csv" });
  fireEvent.change(input, { target: { files: [file] } });
  fireEvent.click(screen.getByRole("button", { name: "Uploader la référence" }));
}

describe("cell-reference upload feedback", () => {
  beforeEach(() => {
    api.getCellSummary.mockReset().mockResolvedValue(summary);
    api.listCellImports.mockReset().mockResolvedValue([]);
    api.uploadCellReference.mockReset();
  });

  it("shows the proxy status and reason after a forced cutoff", async () => {
    api.uploadCellReference.mockRejectedValue(
      new ApiHttpError(
        "CELL_REFERENCE_UPLOAD_TIMEOUT",
        "Le proxy a interrompu l'import du référentiel avant la réponse de l'API.",
        504,
      ),
    );
    mount();
    selectFile();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "HTTP 504 — Le proxy a interrompu l'import du référentiel avant la réponse de l'API.",
    );
  });

  it("keeps visible progress while the API is processing", async () => {
    let finish!: (value: typeof report) => void;
    api.uploadCellReference.mockImplementation(
      (_file: File, options: { onProgress?: (progress: object) => void }) => {
        options.onProgress?.({ loaded: 17, total: 17, percent: 100 });
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
    );
    mount();
    selectFile();

    expect(
      await screen.findByText("File uploaded — cell-reference import in progress…"),
    ).toBeVisible();
    finish(report);
    await screen.findByText(/Upload accepté/);
  });

  it("reloads history before declaring the upload complete", async () => {
    api.uploadCellReference.mockResolvedValue(report);
    api.listCellImports.mockResolvedValueOnce([]).mockResolvedValue([
      {
        id: "ref-new",
        filename: "ref_cell_4G5G.csv",
        uploaded_at: "2026-10-30T21:00:00Z",
        actor: "admin",
        snapshot_date: "2026-06-06",
        rows_read: report.rows_read,
        rows_loaded: report.rows_loaded,
        rows_rejected: report.rows_rejected,
        status: "completed",
        report,
      },
    ]);
    mount();
    await waitFor(() => expect(api.listCellImports).toHaveBeenCalledTimes(1));
    selectFile();

    await waitFor(() => expect(api.listCellImports).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("cell", { name: "ref_cell_4G5G.csv" })).toBeVisible();
  });
});
