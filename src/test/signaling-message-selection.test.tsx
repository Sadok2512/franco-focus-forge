import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { MessagesTable } from "@/features/signaling/MessagesTable";
import type { SigMessage } from "@/lib/api/signaling-schemas";

it("keeps the selected message accessible when a search is cleared", async () => {
  const messages: SigMessage[] = Array.from({ length: 150 }, (_, i) => ({
    index: i + 1, t: i + 0.318, dir: "DL", layer: "RRC NR",
    name: i === 120 ? "SCGAdditionRequest" : "RRCSetup", procedure: "EN-DC",
    ecgi: null, pci: null, earfcn: null, rsrp: null, rsrq: null, sinr: null, octets: 96,
  }));
  Element.prototype.scrollIntoView = vi.fn();
  render(<MessagesTable messages={messages} total={150} selectedIndex={121} onSelect={vi.fn()} getPayload={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Filtrer les messages" }));
  const search = screen.getByRole("textbox", { name: "Rechercher un message" });
  fireEvent.change(search, { target: { value: "SCGAdditionRequest" } });
  fireEvent.change(search, { target: { value: "" } });
  await waitFor(() => {
    const row = screen.getByText("SCGAdditionRequest").closest("tr");
    expect(row?.getAttribute("aria-selected")).toBe("true");
  });
});