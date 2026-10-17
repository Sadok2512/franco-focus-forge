import { Link } from "@tanstack/react-router";
import { FolderOpen } from "lucide-react";
import type { FilterContext } from "@/lib/api/schemas";

/**
 * État vide affiché par les pages scopées projet (Dictionnaire RRC,
 * Assistant IA, Vue d'ensemble, KPI) quand `activeProject === null`.
 *
 * JAMAIS de skeleton infini ni d'auto-sélection : si rien n'est actif,
 * on dit explicitement qu'il faut en choisir un, avec un CTA vers la
 * liste. L'utilisateur comprend l'état et sait quoi faire.
 */
export function NoActiveProject({
  scope,
  hint,
}: {
  scope: string;
  hint?: string;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-6 text-center">
      <FolderOpen className="h-7 w-7 text-muted-foreground" aria-hidden />
      <h1 className="text-base font-semibold">Sélectionne un projet pour commencer</h1>
      <p className="max-w-md text-xs text-muted-foreground">
        {hint ?? `Cette page (${scope}) nécessite un projet actif. Ouvre-en un depuis la liste.`}
      </p>
      <Link
        to="/projects"
        search={(s: FilterContext) => s}
        className="mt-1 inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90"
      >
        <FolderOpen className="h-3.5 w-3.5" /> Voir mes projets
      </Link>
    </div>
  );
}
