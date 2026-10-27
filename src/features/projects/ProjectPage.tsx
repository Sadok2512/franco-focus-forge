import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, FolderOpen, Upload } from "lucide-react";
import { useCallback, useState } from "react";
import { getProject } from "@/lib/api/client";
import type { NmfImportReport } from "@/lib/api/nmf-schemas";
import { ErrorState, LoadingSkeleton } from "@/components/bc4/States";
import { NmfImportPanel } from "./NmfImportPanel";
import { NmfImportReportView } from "./NmfImportReportView";
import { DecodePanel } from "./DecodePanel";
import { Card, Section } from "./shared";

// Id dur du champ fichier interne à `NmfImportPanel`. Le CTA "Ajouter des logs"
// de l'en-tête relaie son clic sur ce `<input type="file">` : zéro duplication
// de l'adaptateur upload (toujours `uploadNmfFiles` via `client.ts`), zéro
// réécriture du composant d'import. Si l'id évolue dans `NmfImportPanel`, mettre
// à jour cette constante — un seul endroit.
const NMF_INPUT_ID = "nmf-files";
const NMF_SECTION_ID = "nmf-import-section";

export function ProjectPage({ projectId }: { projectId: string }) {
  const [report, setReport] = useState<NmfImportReport | null>(null);
  const q = useQuery({
    queryKey: ["project", projectId],
    queryFn: ({ signal }) => getProject(projectId, signal),
  });

  // CTA d'en-tête : focalise la section d'import, puis déclenche le picker
  // natif `.nmf` du `NmfImportPanel`. On ne reposte pas depuis la page : la
  // soumission reste la responsabilité de `NmfImportPanel` (progression XHR +
  // `toUserMessage` + réconciliation `by_file`). La UI ne tape jamais `fetch`
  // directement — `uploadNmfFiles` du `client.ts` est l'unique chemin.
  const openPicker = useCallback(() => {
    if (typeof document === "undefined") return;
    const section = document.getElementById(NMF_SECTION_ID);
    section?.scrollIntoView({ behavior: "smooth", block: "start" });
    const input = document.getElementById(NMF_INPUT_ID) as HTMLInputElement | null;
    if (!input || input.disabled) return;
    // `click()` sur un input file ouvre le picker du navigateur côté user-gesture.
    input.click();
  }, []);

  return (
    <div className="project-fluid-page w-full min-w-0 space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            to="/projects"
            search={(s) => s}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" aria-hidden /> Retour aux projets
          </Link>
          <h1 className="mt-1 text-xl font-semibold">
            {q.isPending ? "Chargement du projet…" : (q.data?.name ?? "Projet")}
          </h1>
          <p className="text-xs text-muted-foreground">
            Identifiant&nbsp;: <code className="font-mono">{projectId}</code>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openPicker}
            disabled={q.isPending || q.isError}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
            aria-label="Ajouter des logs NMF au projet"
          >
            <Upload className="h-3.5 w-3.5" aria-hidden /> Ajouter des logs
          </button>
          <Link
            to="/overview"
            search={{ project: projectId }}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-primary px-3 text-xs font-semibold text-primary hover:bg-accent"
          >
            <FolderOpen className="h-3.5 w-3.5" aria-hidden /> Ouvrir la vue d'ensemble
          </Link>
        </div>
      </div>

      <DecodePanel projectId={projectId} />
      {q.isPending ? (
        <LoadingSkeleton className="h-24" />
      ) : q.isError ? (
        <ErrorState message="Impossible de charger ce projet." onRetry={() => q.refetch()} />
      ) : q.data ? (
        <Card>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs md:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Périmètre</dt>
              <dd className="font-medium">{q.data.geography}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Statut</dt>
              <dd className="font-medium">{q.data.status}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Captures</dt>
              <dd className="font-mono">{q.data.captures.toLocaleString("fr-FR")}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Importé le</dt>
              <dd className="font-mono">{q.data.importedAt}</dd>
            </div>
          </dl>
        </Card>
      ) : null}

      <div id={NMF_SECTION_ID}>
        <Section
          title="Importer des logs NMF"
          description="Sélectionnez un ou plusieurs fichiers .nmf. Chaque fichier est envoyé puis décodé — la progression est individuelle, les erreurs sont affichées par fichier et ne sont pas regroupées silencieusement."
        >
          <NmfImportPanel projectId={projectId} onReport={setReport} />
        </Section>
      </div>

      {report && (
        <Section
          title="Rapport du dernier import NMF"
          description="Totaux agrégés + détail par fichier. `null` est affiché « N/D », jamais 0 — notamment pour la couverture GPS inconnue."
        >
          <NmfImportReportView report={report} />
        </Section>
      )}
    </div>
  );
}
