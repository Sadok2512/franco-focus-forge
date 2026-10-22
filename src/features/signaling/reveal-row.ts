// Garde la ligne sélectionnée dans la zone visible du tableau.
// Le défilement est calculé en pixels de viewport puis appliqué au seul
// conteneur du tableau : ni la page, ni le curseur, ni une requête ne bougent.

export type RevealGeometry = {
  /** Bord haut de la ligne, en pixels de viewport. */
  rowTop: number;
  /** Bord bas de la ligne, en pixels de viewport. */
  rowBottom: number;
  /** Bord haut visible du conteneur (sous l'en-tête collant). */
  viewTop: number;
  /** Bord bas visible du conteneur. */
  viewBottom: number;
};

/** Pixels à ajouter à `scrollTop` pour que la ligne soit entièrement visible. */
export function scrollDelta(g: RevealGeometry): number {
  if (g.rowTop < g.viewTop) return g.rowTop - g.viewTop;
  if (g.rowBottom > g.viewBottom) return g.rowBottom - g.viewBottom;
  return 0;
}

/**
 * Fait défiler `container` jusqu'à la ligne `tr[data-seq=seq]`.
 * Renvoie false si la ligne n'est pas dans la page courante — l'appelant
 * garde alors l'affichage tel quel.
 */
export function revealRow(container: HTMLElement, seq: number): boolean {
  const row = container.querySelector<HTMLElement>(`tr[data-seq="${seq}"]`);
  if (!row) return false;
  const box = container.getBoundingClientRect();
  const head = container.querySelector("thead")?.getBoundingClientRect().height ?? 0;
  const line = row.getBoundingClientRect();
  const delta = scrollDelta({
    rowTop: line.top,
    rowBottom: line.bottom,
    viewTop: box.top + head,
    viewBottom: box.bottom,
  });
  if (delta !== 0) container.scrollTop += delta;
  return true;
}
