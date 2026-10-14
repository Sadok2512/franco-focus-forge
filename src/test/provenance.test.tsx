// G2 — every business value shown in parameter cards/inspector comes from an API response.
import { afterEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { getDictParamDetail, getDictParams } from "@/lib/api/client";
import { DICT_STORE, resetDictStore } from "@/mocks/dictionary";
import { MessageParameterCards } from "@/features/dictionary/MessageParameterCards";
import { ParameterInspector } from "@/features/dictionary/ParameterInspector";
import { pct, renderQ } from "./dictionary-helpers";

const P = "idf-t3-2026";
const fr = (n: number) => n.toLocaleString("fr-FR");
afterEach(() => resetDictStore());

async function assertCardsMatchApi() {
  const api = await getDictParams(P, "lte-mr", {});
  const view = renderQ(<MessageParameterCards projectId={P} filters={{}} msgId="lte-mr" msgName="MeasurementReport" selected={null} onSelect={() => {}} />);
  for (const p of api.params) {
    const card = await screen.findByRole("button", { name: new RegExp(`^${p.leaf}`) });
    const c = within(card);
    expect(c.getByText(`n = ${fr(p.n)}`)).toBeInTheDocument();
    expect(c.getByText(fr(p.distinct))).toBeInTheDocument();
    expect(c.getByText(pct(p.dominant.share!))).toBeInTheDocument();
    expect(card.textContent).toContain(p.dominant.conversion!);
  }
  view.unmount();
  return api;
}

describe("G2 provenance", () => {
  it("parameter cards display exactly the API response", async () => { await assertCardsMatchApi(); });

  it("mutated fixture changes the displayed values (no hardcoded business numbers)", async () => {
    const before = await assertCardsMatchApi();
    const def = DICT_STORE.params.find((d) => d.param_id === "lte-mr-rsrp")!;
    def.samples = 333;
    resetCacheOnly();
    const after = await assertCardsMatchApi();
    const nb = before.params.find((p) => p.param_id === "lte-mr-rsrp")!.n;
    const na = after.params.find((p) => p.param_id === "lte-mr-rsrp")!.n;
    expect(na).not.toBe(nb);
  });

  it("inspector shows dominant raw/share from the detail response", async () => {
    const d = await getDictParamDetail(P, "lte-reconf-tm", "operator", {});
    renderQ(<ParameterInspector fiche={d.fiche} />);
    expect(screen.getByTestId("dominant-raw").textContent).toBe(String(d.fiche.dominant.value));
    expect(screen.getByText(pct(d.fiche.dominant.share!))).toBeInTheDocument();
  });

  it("matrix totals equal the sum of their cells (validated contract)", async () => {
    const d = await getDictParamDetail(P, "lte-mr-rsrp", "operator,band", {});
    for (const r of d.matrix.rows) expect(r.cells.reduce((a, c) => a + c.n, 0)).toBe(r.total);
    expect(d.histogram.reduce((a, b) => a + b.count, 0)).toBe(d.matrix.rows.reduce((a, r) => a + r.total, 0));
  });
});

// Clear generated observations without restoring the mutated definitions.
import { reseedDictStore } from "@/mocks/dictionary";
function resetCacheOnly() { reseedDictStore(DICT_STORE.seedSalt); }
