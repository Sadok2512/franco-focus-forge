import { describe, expect, it } from "vitest";
import { revealRow, scrollDelta } from "@/features/signaling/reveal-row";

// Le tableau des messages défile dans son propre conteneur : la ligne
// sélectionnée depuis la timeline doit rester dans la zone visible.
describe("scrollDelta — la ligne sélectionnée reste visible", () => {
  it("ne défile pas quand la ligne est déjà dans la zone visible", () => {
    expect(scrollDelta({ rowTop: 120, rowBottom: 156, viewTop: 40, viewBottom: 600 })).toBe(0);
  });

  it("remonte de la seule distance manquante quand la ligne est sous l'en-tête", () => {
    expect(scrollDelta({ rowTop: 10, rowBottom: 46, viewTop: 40, viewBottom: 600 })).toBe(-30);
  });

  it("descend de la seule distance manquante quand la ligne dépasse le bord bas", () => {
    expect(scrollDelta({ rowTop: 610, rowBottom: 646, viewTop: 40, viewBottom: 600 })).toBe(46);
  });
});

describe("revealRow — défile le conteneur, pas la page", () => {
  const geometry = (top: number, height: number) => () => ({
    top,
    bottom: top + height,
    left: 0,
    right: 800,
    width: 800,
    height,
    x: 0,
    y: top,
    toJSON: () => ({}),
  });

  const setup = (rowTop: number) => {
    const container = document.createElement("div");
    container.innerHTML = `<table><thead><tr><th>Seq</th></tr></thead><tbody>
      <tr data-seq="41"><td>a</td></tr><tr data-seq="42"><td>b</td></tr>
    </tbody></table>`;
    const thead = container.querySelector("thead") as HTMLElement;
    const row = container.querySelector('tr[data-seq="42"]') as HTMLElement;
    container.getBoundingClientRect = geometry(100, 400);
    thead.getBoundingClientRect = geometry(100, 34);
    row.getBoundingClientRect = geometry(rowTop, 36);
    Object.defineProperty(container, "scrollTop", { value: 0, writable: true });
    return { container, row };
  };

  it("amène sous l'en-tête la ligne masquée par celui-ci", () => {
    const { container } = setup(110);
    expect(revealRow(container, 42)).toBe(true);
    //可见 zone visible = 134 → 500 ; la ligne (36 px) est sous l'en-tête.
    expect(container.scrollTop).toBe(110 - 134);
  });

  it("ne déplace rien quand la ligne est déjà visible", () => {
    const { container } = setup(200);
    expect(revealRow(container, 42)).toBe(true);
    expect(container.scrollTop).toBe(0);
  });

  it("signale une ligne absente de la page courante", () => {
    const { container } = setup(200);
    expect(revealRow(container, 999)).toBe(false);
    expect(container.scrollTop).toBe(0);
  });
});
