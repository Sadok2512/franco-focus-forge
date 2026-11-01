import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import "@/lib/i18n";
import { SelectedPointCard } from "@/features/kpi/SelectedPointCard";
import { pointDetails } from "@/features/kpi/measurement-point-popup";

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

const details = (p: Parameters<typeof pointDetails>[0]) =>
  pointDetails(p, "RSRP (LTE) @ Serving", "dBm");

describe("MAP UI V1 selected-point RF card", () => {
  it("shows only the real radio, serving and anchor values", () => {
    render(<SelectedPointCard details={details(point)} onClose={() => {}} />);
    const card = screen.getByTestId("selected-point-card");
    expect(card).toHaveTextContent("RSRP");
    expect(card).toHaveTextContent("-91 dBm");
    expect(card).toHaveTextContent("PCI");
    expect(card).toHaveTextContent("196");
    expect(card).toHaveTextContent("412 m");
    expect(card).toHaveTextContent("7"); // NR anchor PCI
    // Never rendered by default: no fabricated indicators.
    for (const banned of ["RSSI", "CQI", "BLER", "Throughput", "Latency", "RRC", "EARFCN"])
      expect(card).not.toHaveTextContent(banned);
  });

  it("omits the anchor section when no anchor cell exists", () => {
    const { nr_anchor_link: _dropped, ...withoutAnchor } = point;
    render(<SelectedPointCard details={details(withoutAnchor)} onClose={() => {}} />);
    const card = screen.getByTestId("selected-point-card");
    expect(card).not.toHaveTextContent("NR");
    expect(card).toHaveTextContent("196");
  });

  it("omits the serving section when no serving evidence exists", () => {
    render(
      <SelectedPointCard
        details={details({ seq: 1, lat: 50.4, lng: 3.1, value: -100 })}
        onClose={() => {}}
      />,
    );
    const card = screen.getByTestId("selected-point-card");
    expect(card).toHaveTextContent("-100 dBm");
    expect(card).not.toHaveTextContent("PCI");
  });

  it("collapses and expands through its toggle, and closes through onClose", () => {
    const onClose = vi.fn();
    render(<SelectedPointCard details={details(point)} onClose={onClose} />);
    const card = screen.getByTestId("selected-point-card");
    fireEvent.click(screen.getByRole("button", { name: /reduce the card/i }));
    expect(card).not.toHaveTextContent("-91 dBm");
    fireEvent.click(screen.getByRole("button", { name: /expand the card/i }));
    expect(card).toHaveTextContent("-91 dBm");
    fireEvent.click(screen.getByRole("button", { name: /close the card/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
