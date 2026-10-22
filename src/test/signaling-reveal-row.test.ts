import { describe, expect, it } from "vitest";
import { scrollDelta } from "@/features/signaling/reveal-row";

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
