import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { MessageFilterPopover } from "@/features/signaling/MessageFilterPopover";
import type { MessageSelection } from "@/features/signaling/message-filter";
import "@/lib/i18n";

const types = [
  { key: "paging", name: "Paging", protocol: "RRC LTE", count: 24 },
  { key: "request", name: "RRCConnectionRequest", protocol: "RRC LTE", count: 11 },
];
describe("transactional popup", () => {
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
    fireEvent.click(screen.getByTestId("message-filter-trigger"));
    fireEvent.click(screen.getByRole("checkbox", { name: "Paging · RRC LTE" }));
    expect(apply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByTestId("message-filter-trigger"));
    expect(screen.getByRole("checkbox", { name: "Paging · RRC LTE" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Paging · RRC LTE" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(apply).toHaveBeenCalledWith(["request"]);
    fireEvent.click(screen.getByTestId("message-filter-trigger"));
    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: "Paging · RRC LTE" })).toHaveAttribute(
        "aria-checked",
        "false",
      ),
    );
  });
});
