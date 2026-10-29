import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { QueryErrorState } from "@/features/kpi/QueryErrorState";
import { downloadCsv } from "@/features/kpi/workspace-model";
import { ApiHttpError, ApiUnauthenticatedError } from "@/lib/api/http";
import "@/lib/i18n";

describe("KPI UX feedback", () => {
  it("affiche le statut HTTP et permet de réessayer après un 500", () => {
    const retry = vi.fn();
    render(
      <QueryErrorState
        error={new ApiHttpError("INTERNAL_ERROR", "Internal Server Error", 500)}
        title="Series unavailable"
        onRetry={retry}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("HTTP 500 — Internal Server Error");
    fireEvent.click(screen.getByRole("button", { name: /retry|réessayer/i }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("affiche une erreur 401 lisible au lieu de conserver un loader", () => {
    render(
      <QueryErrorState
        error={new ApiUnauthenticatedError("expired")}
        title="Data unavailable"
        onRetry={() => {}}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/session.*reconnex/i);
  });

  it("attache le lien CSV au DOM avant de déclencher le téléchargement", () => {
    const createObjectURL = vi.fn(() => "blob:metrics-export");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const append = vi.spyOn(document.body, "appendChild");

    downloadCsv("time,value\n0,1", "metrics_test");

    expect(append).toHaveBeenCalledWith(expect.any(HTMLAnchorElement));
    expect(click).toHaveBeenCalledOnce();
    expect(document.querySelector('a[download="metrics_test.csv"]')).toBeNull();
  });
});
