import { beforeEach } from "vitest";
import { setLanguage } from "@/lib/i18n";

// Existing French accessibility assertions remain a French-language regression suite.
beforeEach(async () => {
  await setLanguage("fr");
});
import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FilterSelect } from "@/features/dict-v2/FilterSelect";

function Harness() {
  const [value, setValue] = useState<string[]>([]);
  return (
    <>
      <FilterSelect
        label="Opérateur"
        operatorBadges
        showLabel
        options={["Orange", "Free", "SFR", "Bouygues", "N/D", "ND", "Non attribué"]}
        value={value}
        onChange={setValue}
      />
      <output data-testid="draft">{JSON.stringify(value)}</output>
    </>
  );
}
describe("operator filter defaults", () => {
  it("shows all badges and checked options without changing the unrestricted API filter, then edits a subset", () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Opérateur — Orange, Free, SFR, Bouygues" });
    expect(within(trigger).getByText("Free")).toHaveClass("bg-op-free");
    expect(within(trigger).getByText("Orange")).toBeVisible();
    expect(screen.getByTestId("draft")).toHaveTextContent("[]");
    expect(within(trigger).queryByText("N/D")).not.toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.queryByRole("checkbox", { name: "N/D" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(4);
    for (const name of ["Orange", "Free", "SFR", "Bouygues"]) {
      expect(screen.getByRole("checkbox", { name })).toBeChecked();
    }
    fireEvent.click(screen.getByRole("checkbox", { name: "Free" }));
    expect(screen.getByTestId("draft")).toHaveTextContent('["Orange","SFR","Bouygues"]');
    expect(screen.getByRole("checkbox", { name: "Free" })).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Tout sélectionner" }));
    expect(screen.getByTestId("draft")).toHaveTextContent("[]");
    expect(screen.getByRole("checkbox", { name: "Free" })).toBeChecked();
  });
});
