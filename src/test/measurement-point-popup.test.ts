import { describe, expect, it } from "vitest";
import {
  buildMeasurementPointPopup,
  linkConfidence,
  pointCellLinks,
  pointDetails,
} from "@/features/kpi/measurement-point-popup";
import "@/lib/i18n";

const point = {
  seq: 42,
  lat: 50.41,
  lng: 3.08,
  value: -91,
  t_rel_s: 65.125,
  serving_site_name: "DOUAI CENTRE",
  serving_cell_lat: 50.42,
  serving_cell_lng: 3.09,
  serving_cell_pci: 196,
  serving_cell_arfcn: 1675,
  serving_link_distance_m: 412,
  serving_link_confidence: "proven_operator_eci",
  neighbour_links: [
    {
      lat: 50.43,
      lng: 3.1,
      site_name: "DOUAI NORD",
      pci: 195,
      arfcn: 1675,
      distance_m: 859,
      value: -98,
      unit: "dBm",
      confidence: "radio_arfcn_pci_nearest_within_25000m",
    },
  ],
  nr_anchor_link: {
    lat: 50.44,
    lng: 3.11,
    site_name: "DOUAI NR",
    pci: 7,
    arfcn: 643392,
    distance_m: 1200,
    confidence: "proven",
  },
};

describe("shared measurement-point popup", () => {
  it("normalises backend proof names into solid and dashed presentation confidence", () => {
    expect(linkConfidence("proven_operator_eci")).toBe("proven");
    expect(linkConfidence("radio_arfcn_pci_unique")).toBe("proven");
    expect(linkConfidence("probable_band_pci_nearest_within_10000m")).toBe("probable");
    expect(linkConfidence("probable")).toBe("probable");
  });

  it("keeps the three independently coloured link kinds and their identity evidence", () => {
    const links = pointCellLinks(point);
    expect(links.map((link) => [link.kind, link.confidence])).toEqual([
      ["serving", "proven"],
      ["neighbour", "probable"],
      ["nr_anchor", "proven"],
    ]);
    expect(links[0]).toMatchObject({ pci: 196, arfcn: 1675, distanceM: 412 });
    expect(links[1]).toMatchObject({ pci: 195, arfcn: 1675, value: -98 });
  });

  it("never turns coordinates without backend evidence into a serving link", () => {
    expect(
      pointCellLinks({
        seq: 1,
        lat: 50.4,
        lng: 3.1,
        serving_cell_lat: 50.41,
        serving_cell_lng: 3.11,
      }),
    ).toEqual([]);
  });

  it("renders time, metric value, serving identity and neighbours in one readable card", () => {
    const card = buildMeasurementPointPopup(pointDetails(point, "RSRP (LTE) @ Serving", "dBm"));
    expect(card.textContent).toContain("RSRP (LTE) @ Serving");
    expect(card.textContent).toContain("-91 dBm");
    expect(card.textContent).toContain("00:01:05.125");
    expect(card.textContent).toContain("DOUAI CENTRE");
    expect(card.textContent).toContain("PCI 196 · EARFCN 1675 · 412 m");
    expect(card.textContent).toContain("DOUAI NORD");
    expect(card.textContent).toContain("PCI 195 · EARFCN 1675 · 859 m · -98 dBm");
    expect(card.querySelectorAll(".measurement-popup-line.is-probable")).toHaveLength(1);
  });
});
