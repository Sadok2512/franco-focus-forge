import { beforeEach } from "vitest";
import { setLanguage } from "@/lib/i18n";

// Existing French accessibility assertions remain a French-language regression suite.
beforeEach(async () => {
  await setLanguage("fr");
});
import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GeographicFilter } from "@/features/dict-v2/GeographicFilter";
import { geoDraft } from "@/features/dict-v2/geographic-state";
import type { DictGeographicDimension } from "@/lib/api/dict-v2";

const dimensions: DictGeographicDimension[] = [
  { key: "dor", label: "DOR", available: true, reason: null, options: ["Nord", "Sud"], count: 2 },
  {
    key: "plaque",
    label: "Plaque",
    available: true,
    reason: null,
    options: ["Plaque A"],
    count: 1,
  },
  {
    key: "arcep_zone",
    label: "Zone ARCEP",
    available: false,
    reason: "Aucune liaison ECGI stricte",
    options: [],
    count: 0,
  },
];
function Harness() {
  const [draft, setDraft] = useState(geoDraft({}));
  return (
    <>
      <GeographicFilter
        dimensions={dimensions}
        draft={draft}
        onChange={setDraft}
        loading={false}
        error={false}
      />
      <output data-testid="geo-state">{JSON.stringify(draft)}</output>
    </>
  );
}
describe("RRC geographic filters", () => {
  it("enables, searches, selects and disables independently without losing draft values", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Zone géographique — Toutes" }));
    expect(screen.getByRole("switch", { name: "Activer Zone ARCEP" })).toBeDisabled();
    expect(screen.queryByText("Aucune liaison ECGI stricte")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "Activer DOR" }));
    fireEvent.keyDown(screen.getByRole("switch", { name: "Activer DOR" }), { key: "Escape" });
    expect(screen.queryByRole("switch", { name: "Activer DOR" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "DOR — Tous" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Rechercher DOR" }), {
      target: { value: "Nord" },
    });
    expect(screen.queryByRole("checkbox", { name: "Sud" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Nord" }));
    expect(JSON.parse(screen.getByTestId("geo-state").textContent!).dor).toEqual({
      enabled: true,
      values: ["Nord"],
    });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Rechercher DOR" }), { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Zone géographique — 1 valeur" }));
    fireEvent.click(screen.getByRole("switch", { name: "Activer Plaque" }));
    fireEvent.click(screen.getByRole("switch", { name: "Activer DOR" }));
    const state = JSON.parse(screen.getByTestId("geo-state").textContent!);
    expect(state.dor).toEqual({ enabled: false, values: ["Nord"] });
    expect(state.plaque.enabled).toBe(true);
    expect(
      screen.queryByRole("button", { name: "DOR — 1 sélectionné(s)" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Effacer DOR Nord" }));
    expect(JSON.parse(screen.getByTestId("geo-state").textContent!).dor.values).toEqual([]);
  });
  it("allows Zone ARCEP activation when the API confirms linkage", () => {
    const onChange = vi.fn();
    render(
      <GeographicFilter
        dimensions={dimensions.map((d) =>
          d.key === "arcep_zone"
            ? { ...d, available: true, reason: null, options: ["Zone 1"], count: 1 }
            : d,
        )}
        draft={geoDraft({})}
        onChange={onChange}
        loading={false}
        error={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Zone géographique — Toutes" }));
    const control = screen.getByRole("switch", { name: "Activer Zone ARCEP" });
    expect(control).toBeEnabled();
    fireEvent.click(control);
    expect(onChange.mock.calls[0]![0].arcep_zone.enabled).toBe(true);
  });
});
