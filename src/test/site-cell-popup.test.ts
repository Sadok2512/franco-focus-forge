import { describe, expect, it, vi } from "vitest";
import "@/lib/i18n";
import { buildCellCard, buildSiteCard } from "@/features/kpi/site-cell-popup";
import { applyBasemap, readBasemap } from "@/features/kpi/basemaps";

describe("site / cell popup", () => {
  it("shows — for missing RF fields, never invented values", () => {
    const card = buildCellCard({ cell_name: "C1", band: "B3", techno: "LTE", pci: 12 }, "Orange", null);
    const dd = [...card.querySelectorAll("dd")].map((d) => d.textContent);
    expect(dd).toContain("12");
    expect(card.textContent).toContain("EARFCN");
    expect(dd.filter((v) => v === "—").length).toBeGreaterThanOrEqual(3);
  });
  it("lists the site's cells and opens a cell on click", () => {
    const onCell = vi.fn();
    const cells = [{ cell_name: "A", band: "n78", techno: "5G", pci: 1 }];
    const card = buildSiteCard({ site_name: "S", site_id: "1", n_cells: 1 }, [2, 48], "SFR", cells, onCell);
    expect(card.querySelectorAll("tr[role=button]")).toHaveLength(1);
    (card.querySelector("tr[role=button]") as HTMLElement).click();
    expect(onCell).toHaveBeenCalledWith(cells[0]);
    expect(card.textContent).toContain("5G");
  });
});

describe("basemaps", () => {
  it("defaults to Street", () => {
    window.localStorage.removeItem("bc4.map.basemap.v1");
    expect(readBasemap()).toBe("street");
  });
  it("satellite hides OSM without touching other layers", () => {
    const vis: Record<string, string> = {};
    const map = { getLayer: () => true, setLayoutProperty: (id: string, _k: string, v: string) => (vis[id] = v), setPaintProperty: vi.fn(), getContainer: () => null };
    applyBasemap(map as never, "satellite");
    expect(vis).toEqual({ osm: "none", "basemap-sat": "visible", "basemap-sat-labels": "visible" });
  });
});
