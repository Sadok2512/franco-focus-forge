import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import i18n from "@/lib/i18n";
import { HeaderFloatingButton } from "@/components/bc4/HeaderFloatingButton";
import { setHeaderFloating, useHeaderFloating } from "@/lib/header-floating";

// La préférence est stockée ici ; les tests la repartent à zéro pour que le
// défaut (« flottante ») soit bien observé.
const KEY = "bc4.headerFloating.v1";

function Probe() {
  return <span data-testid="state">{String(useHeaderFloating())}</span>;
}

const reset = () => {
  localStorage.removeItem(KEY);
  document.documentElement.classList.remove("app-header-floating");
};

beforeEach(reset);
afterEach(() => {
  cleanup();
  reset();
});

describe("header floating preference", () => {
  it("floats by default so the header reserves no page height", () => {
    render(<Probe />);
    expect(screen.getByTestId("state")).toHaveTextContent("true");
    expect(document.documentElement).toHaveClass("app-header-floating");
  });

  it("docks the header from the header button and remembers the choice", () => {
    render(<HeaderFloatingButton />);
    fireEvent.click(screen.getByRole("button", { name: i18n.t("common.headerFloating") }));
    expect(document.documentElement).not.toHaveClass("app-header-floating");
    expect(localStorage.getItem(KEY)).toBe("0");

    // le choix survit à un remontage, comme après un rechargement de page
    cleanup();
    render(<Probe />);
    expect(screen.getByTestId("state")).toHaveTextContent("false");
    expect(document.documentElement).not.toHaveClass("app-header-floating");
  });

  it("keeps two mounted readers in sync", () => {
    render(
      <>
        <Probe />
        <Probe />
      </>,
    );
    act(() => setHeaderFloating(false));
    expect(screen.getAllByTestId("state").map((n) => n.textContent)).toEqual(["false", "false"]);
    expect(document.documentElement).not.toHaveClass("app-header-floating");
  });
});
