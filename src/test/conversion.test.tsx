// G4 — 3GPP conversion displayed exactly per the API rule; non-convertible parameters stay raw.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { convert, getDictParamDetail } from "@/lib/api/client";
import { DICT_STORE, resetDictStore } from "@/mocks/dictionary";
import { ParameterInspector } from "@/features/dictionary/ParameterInspector";
import { renderQ } from "./dictionary-helpers";

const P = "idf-t3-2026";
afterEach(() => { cleanup(); resetDictStore(); });

describe("G4 conversion", () => {
  it("rsrpResult regression: index 0→-140, 97→-43 dBm (TS 36.133)", () => {
    const rule = DICT_STORE.params.find((d) => d.param_id === "lte-mr-rsrp")!.conversion_rule;
    expect(convert(rule, 0)).toBe("-140 dBm");
    expect(convert(rule, 54)).toBe("-86 dBm");
    expect(convert(rule, 97)).toBe("-43 dBm");
  });

  it("rsrpResult display equals the fixture conversion_rule", async () => {
    const d = await getDictParamDetail(P, "lte-mr-rsrp", "operator", {});
    renderQ(<ParameterInspector fiche={d.fiche} />);
    const raw = d.fiche.dominant.value as number;
    expect(screen.getByTestId("dominant-conv").textContent).toBe(`${(raw - 140).toLocaleString("fr-FR")} dBm`);
    expect(screen.getByTestId("conv-rule").textContent).toBe(d.fiche.conversion_rule!.formula);
  });

  it("non-convertible parameter (a3-Offset) is labelled raw, no guessed step", async () => {
    const d = await getDictParamDetail(P, "lte-reconf-a3", "operator", {});
    expect(d.fiche.conversion_rule).toBeNull();
    renderQ(<ParameterInspector fiche={d.fiche} />);
    expect(screen.getByTestId("dominant-conv").textContent).toBe("Index brut — conversion indisponible");
  });

  it("changing the fixture rule updates the UI (catches stale constants)", async () => {
    const def = DICT_STORE.params.find((d) => d.param_id === "lte-mr-rsrp")!;
    def.conversion_rule = { ...def.conversion_rule!, offset: -150, formula: "dBm = index − 150 (fixture mutée)" };
    const d = await getDictParamDetail(P, "lte-mr-rsrp", "operator", {});
    renderQ(<ParameterInspector fiche={d.fiche} />);
    const raw = d.fiche.dominant.value as number;
    expect(screen.getByTestId("dominant-conv").textContent).toBe(`${(raw - 150).toLocaleString("fr-FR")} dBm`);
    expect(screen.getByTestId("dominant-conv").textContent).not.toBe(`${(raw - 140).toLocaleString("fr-FR")} dBm`);
  });
});
