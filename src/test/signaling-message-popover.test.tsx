import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { MessageFilterPopover } from "@/features/signaling/MessageFilterPopover";
import type { MessageSelection } from "@/features/signaling/message-filter";
import "@/lib/i18n";

const types = [
  { key: "paging", name: "Paging", protocol: "RRC LTE", count: 24, technology: "LTE" as const, channel: "PCCH" },
  { key: "request", name: "RRCConnectionRequest", protocol: "RRC LTE", count: 11, technology: "LTE" as const, channel: "UL-CCCH" },
];

const openAndExpand = (...channelIds: string[]) => {
  fireEvent.click(screen.getByTestId("message-filter-trigger"));
  fireEvent.click(screen.getByTestId("tree-chevron-LTE"));
  for (const id of channelIds) fireEvent.click(screen.getByTestId(`tree-chevron-LTE/${id}`));
};

describe("transactional popup", () => {
  it("opens with every group closed: only technologies are listed", () => {
    render(<MessageFilterPopover types={types} selection={null} onApply={() => {}} onRequest={() => {}} loading={false} error={false} />);
    fireEvent.click(screen.getByTestId("message-filter-trigger"));
    expect(screen.getByTestId("tree-tech-LTE")).toBeInTheDocument();
    expect(screen.getByTestId("tree-chevron-LTE")).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("checkbox", { name: "Paging · RRC LTE" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("tree-channel-LTE/PCCH")).not.toBeInTheDocument();
  });

  it("Cancel leaves the applied selection untouched; Apply persists across reopen", async () => {
    const apply = vi.fn();
    function Harness() {
      const [selection, setSelection] = useState<MessageSelection>(null);
      return (
        <MessageFilterPopover
          types={types}
          selection={selection}
          onApply={(v) => {
            apply(v);
            setSelection(v);
          }}
          onRequest={() => {}}
          loading={false}
          error={false}
        />
      );
    }
    render(<Harness />);
    openAndExpand("PCCH");
    fireEvent.click(screen.getByRole("checkbox", { name: "Paging · RRC LTE" }));
    expect(apply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    openAndExpand("PCCH");
    expect(screen.getByRole("checkbox", { name: "Paging · RRC LTE" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Paging · RRC LTE" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(apply).toHaveBeenCalledWith(["request"]);
    openAndExpand("PCCH");
    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: "Paging · RRC LTE" })).toHaveAttribute(
        "aria-checked",
        "false",
      ),
    );
  });
});
