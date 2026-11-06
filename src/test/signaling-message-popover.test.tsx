import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { MessageFilterPopover } from "@/features/signaling/MessageFilterPopover";
import { ALL_MESSAGE_FILTERS, type MessageFilterState } from "@/features/signaling/message-filter";
import "@/lib/i18n";

const types = [
  {
    key: "paging",
    name: "Paging",
    protocol: "RRC LTE",
    count: 24,
    technology: "LTE" as const,
    channel: "PCCH",
  },
  {
    key: "request",
    name: "RRCConnectionRequest",
    protocol: "RRC LTE",
    count: 11,
    technology: "LTE" as const,
    channel: "UL-CCCH",
  },
];

const openFilter = () => {
  fireEvent.click(screen.getByTestId("message-filter-trigger"));
};

describe("transactional popup", () => {
  it("shows presets, certified categories and exact message names", () => {
    render(
      <MessageFilterPopover
        types={types}
        filter={ALL_MESSAGE_FILTERS}
        onApply={() => {}}
        onRequest={() => {}}
        loading={false}
        error={false}
      />,
    );
    fireEvent.click(screen.getByTestId("message-filter-trigger"));
    expect(screen.getByRole("button", { name: "RRC only" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "PCCH / Paging" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("checkbox", { name: "Paging" })).toBeInTheDocument();
  });

  it("Cancel leaves the applied selection untouched; Apply persists across reopen", async () => {
    const apply = vi.fn();
    function Harness() {
      const [filter, setFilter] = useState<MessageFilterState>(ALL_MESSAGE_FILTERS);
      return (
        <MessageFilterPopover
          types={types}
          filter={filter}
          onApply={(v) => {
            apply(v);
            setFilter(v);
          }}
          onRequest={() => {}}
          loading={false}
          error={false}
        />
      );
    }
    render(<Harness />);
    openFilter();
    fireEvent.click(screen.getByRole("checkbox", { name: "Paging" }));
    expect(apply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    openFilter();
    expect(screen.getByRole("checkbox", { name: "Paging" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Paging" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(apply).toHaveBeenCalledWith(
      expect.objectContaining({ names: ["RRCConnectionRequest"] }),
    );
    openFilter();
    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: "Paging" })).toHaveAttribute(
        "aria-checked",
        "false",
      ),
    );
  });
});
