import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  CheckCircle2 as CheckSuccess,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronRight as ChevronRowClosed,
  Clock,
  FolderOpen,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createProject, deleteProject, getProjects } from "@/lib/api/client";
import type { ProjectIngestView } from "@/lib/api/client";
import { OPERATORS, TECHNOLOGIES, type Project } from "@/lib/api/schemas";
import { useActiveProject } from "@/lib/activeProject";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/bc4/States";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CreateProjectDialog } from "@/features/projects/CreateProjectDialog";
import { DeleteProjectDialog } from "@/features/projects/DeleteProjectDialog";
import {
  ProjectRowNmfAction,
  type ProjectRowNmfReport,
} from "@/features/projects/ProjectRowNmfAction";
import { ProjectRowDetails } from "@/features/projects/ProjectRowDetails";
import { SuperstreamDialog } from "@/features/projects/SuperstreamDialog";
import { SuperstreamTree, superstreamsKey } from "@/features/projects/SuperstreamTree";
import { listSuperstreams, type Superstream } from "@/lib/api/superstreams";
import { useTranslation } from "react-i18next";
import { Layers } from "lucide-react";
import {
  OperatorChip,
  TechBadge,
  selectOperatorLabels,
  selectTechLabels,
  importProgressLabel,
} from "@/features/projects/shared";

export const Route = createFileRoute("/_app/projects")({
  head: () => ({
    meta: [
      { title: "Mes projets — BC4" },
      {
        name: "description",
        content: "Gérez vos campagnes de mesures radio et accédez à vos analyses.",
      },
      { property: "og:title", content: "Mes projets — BC4" },
      {
        property: "og:description",
        content: "Gérez vos campagnes de mesures radio et accédez à vos analyses.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProjectsPage,
});

// Les codes `processing` et `error` NE sont PAS exposés en tant que code
// brut dans la UI : chaque libellé est explicite (« Traitement »,
// « Échec »). Le code reste côté état.
const STATUS: Record<Project["status"] | "error", { l: string; c: string; i: typeof Clock }> = {
  ready: { l: "Prêt", c: "text-sev-good", i: CheckCircle2 },
  processing: { l: "Traitement", c: "border border-primary text-primary", i: Clock },
  failed: { l: "Échec", c: "text-destructive", i: XCircle },
  // Statut local déduit du rapport d'import (`files_error > 0`) : la
  // colonne Statut doit refléter l'échec SANS attendre un refetch du
  // back. Le libellé reste « Échec » comme pour `failed`, mais tracé
  // séparément dans l'override local pour qu'un refetch postérieur
  // puisse « réparer » la ligne sans écraser l'état du back.
  error: { l: "Échec", c: "text-destructive", i: XCircle },
};
const fmtDate = (d: string) => d.split("-").reverse().join("/");
const fmtCount = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)} M` : n >= 1e3 ? `${Math.round(n / 1e3)} k` : String(n);

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { v: string; l: string }[];
}) {
  return (
    <label className="block min-w-0">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <div className="relative mt-0.5">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-full appearance-none rounded-md border border-input bg-card pl-3 pr-8 text-sm"
        >
          {options.map((o) => (
            <option key={o.v} value={o.v}>
              {o.l}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
      </div>
    </label>
  );
}

/** Overlay local par projectId appliqué par-dessus la ligne du listing
 *  pendant / après un upload NMF. Rafraîchi en priorité par refetch de
 *  `getProjects`, mais le rapport est faisant foi sur `n_captures`
 *  (évite de montrer un chiffre stale pendant 1-2 secondes). */
type RowOverlay = {
  /** « processing » pendant l'envoi, « error » après échec métier
   *  (files_error > 0). `null` → la UI retombe sur `p.status`. */
  status: Project["status"] | "error" | null;
  /** Captures du dernier rapport (prioritaire sur `p.captures`). */
  captures: number | null;
  /** Erreur HTTP affichée en badge. `null` quand clear. */
  errorMsg: string | null;
};

function emptyOverlay(): RowOverlay {
  return { status: null, captures: null, errorMsg: null };
}

function ProjectsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [overlays, setOverlays] = useState<Record<string, RowOverlay>>({});
  const q = useQuery({
    queryKey: ["projects"],
    queryFn: ({ signal }) => getProjects(signal),
    // Le serveur peut continuer après une coupure de la requête d'import.
    refetchInterval: (query) =>
      Object.values(overlays).some((overlay) => overlay.status === "processing") ||
      query.state.data?.some((p) => p.status === "processing" && ((p.n_files ?? 0) > 0 || p.import_job != null))
        ? 5000
        : false,
  });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [op, setOp] = useState("");
  const [tech, setTech] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  // 1.6.0 — Modale de confirmation de suppression (shadcn AlertDialog).
  // On garde `pendingDelete` SÉPARÉ de l'overlay NMF : la suppression
  // peut concerner un projet en erreur ou en traitement, sans croiser
  // les overlays d'upload.
  const [pendingDelete, setPendingDelete] = useState<Project | null>(null);
  const { t } = useTranslation();
  const [ssProject, setSsProject] = useState<Project | null>(null);
  const [ssHighlight, setSsHighlight] = useState<Record<string, string>>({});
  const ssList = useQuery({
    queryKey: ssProject ? superstreamsKey(ssProject.id) : ["superstreams-none"],
    queryFn: ({ signal }) => (ssProject ? listSuperstreams(ssProject.id, signal) : Promise.resolve([] as Superstream[])),
    enabled: ssProject !== null,
  });
  // Notification discrète (succès suppression). Pas de dépendance
  // sonner — on garde un state local qui s'auto-efface au bout de 4s.
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);
  // Overlay local par projectId pour afficher la progression / le résultat
  // de l'upload NMF SANS attendre un refetch complet des projets.
  // 1.5.1 — Accordéon par ligne (expand/collapse) : set d'ids ouverts
  // pour permettre plusieurs lignes ouvertes simultanément. Le fetch du
  // rapport d'import est PARESSEUX côté `ProjectRowDetails`.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const createM = useMutation<ProjectIngestView, Error, string>({
    mutationFn: (name: string) => createProject(name),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      setShowCreate(false);
      navigate({ to: "/projects/$projectId", params: { projectId: p.id } });
    },
  });

  const rows = useMemo(() => {
    const s = search.toLowerCase();
    return (q.data ?? []).filter((p) => {
      if (s && !`${p.name} ${p.geography}`.toLowerCase().includes(s)) return false;
      if (status && p.status !== status) return false;
      // 1.6.0 — filtre opérateur sur les LABELS effectifs (B0 d'abord,
      // fallback PLMN sinon). Les filtres déroulants listent toujours
      // l'enum fermé `OPERATORS`/`TECHNOLOGIES` : un projet dont la
      // seule source est `operators_plmn` (clés PLMN) ne matche pas
      // le filtre « Orange » tant que la table PLMN→opérateur côté
      // back ne résout pas le libellé. Jamais inventer côté front.
      if (op) {
        const ops = selectOperatorLabels(p);
        if (!ops.includes(op)) return false;
      }
      if (tech) {
        const techs = selectTechLabels(p);
        if (!techs.includes(tech)) return false;
      }
      return true;
    });
  }, [q.data, search, status, op, tech]);

  // 1.11.0 — « Ouvrir » = sélectionne le projet comme actif (store global
  // + persisté par-viewer). PAS de navigation vers /projects/$projectId —
  // ce chemin reste pour l'import NMF, pris en charge par le bouton
  // dédié (ProjectRowNmfAction) sur la même ligne. L'utilisateur peut
  // alors aller librement sur Dictionnaire / Assistant / Vue d'ensemble
  // et y retrouver CE projet (plus d'auto-sélection silencieuse).
  const { activeProject, setActiveProject } = useActiveProject();
  const open = (p: Project) => {
    setActiveProject({ id: p.id, name: p.name });
    toast.success(`Projet « ${p.name} » chargé`, {
      description: "Les pages Dictionnaire, Assistant, Vue d'ensemble et KPI utilisent désormais ce projet.",
    });
  };

  const setOverlay = useCallback((id: string, patch: Partial<RowOverlay>) => {
    setOverlays((prev) => ({ ...prev, [id]: { ...(prev[id] ?? emptyOverlay()), ...patch } }));
  }, []);

  const handleStart = useCallback(
    (id: string) => setOverlay(id, { status: "processing", errorMsg: null }),
    [setOverlay],
  );

  const handleReport = useCallback(
    (id: string, r: ProjectRowNmfReport) => {
      // Captures = n_captures du rapport (jamais n_events — règle dure).
      setOverlay(id, {
        status: r.derivedStatus,
        captures: r.report.n_captures,
        errorMsg: r.derivedStatus === "error" ? r.firstErrorMsg : null,
      });
      // Rafraîchit la liste en arrière-plan pour aligner `p.status` du
      // back (le projet passe à `ready` quand tous les fichiers sont
      // décodés). L'overlay prime visuellement tant qu'il n'est pas
      // écrasé par un overlay postérieur.
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
    [qc, setOverlay],
  );

  const handleError = useCallback(
    (id: string, userMsg: string) => {
      // L'erreur HTTP ne doit pas « verrouiller » la ligne en Traitement :
      // on efface le statut dérivé pour que la ligne retombe sur
      // `p.status` et on expose l'erreur en badge local.
      setOverlay(id, { status: null, errorMsg: userMsg });
      void qc.invalidateQueries({ queryKey: ["projects"] });
    },
    [qc, setOverlay],
  );

  // 1.6.0 — Suppression projet. L'invalidation `projects` provoque un
  // refetch complet (plus simple et moins propice au drift qu'une
  // mutation locale du cache). La modale reste ouverte en cas d'échec
  // — voir `DeleteProjectDialog.handleConfirm`.
  const deleteM = useMutation<void, Error, { id: string; name: string }>({
    mutationFn: ({ id }) => deleteProject(id),
    onSuccess: (_v, { name }) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      setPendingDelete(null);
      setNotice(`Projet « ${name} » supprimé.`);
    },
  });

  return (
    <div className="w-full min-w-0 p-3 sm:p-5 lg:p-6">
      <div className="min-w-0 space-y-5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-bold sm:text-2xl">Mes projets</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Gérez vos campagnes de mesures et accédez à vos analyses.
            </p>
          </div>
          <Button
            type="button"
            onClick={() => {
              createM.reset();
              setShowCreate(true);
            }}
            className="h-10 shrink-0 px-3 text-xs font-semibold sm:px-4 sm:text-sm"
          >
            <Plus className="h-4 w-4" /> Nouveau projet
          </Button>
        </div>

        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(240px,2fr)_repeat(3,minmax(140px,1fr))]">
          <label className="relative block min-w-0">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un projet…"
              aria-label="Rechercher un projet"
              className="h-9 w-full rounded-md border border-input bg-card pl-9 pr-3 text-sm"
            />
          </label>
          <Select
            label="Statut"
            value={status}
            onChange={setStatus}
            options={[
              { v: "", l: "Tous" },
              { v: "ready", l: "Prêt" },
              { v: "processing", l: "Traitement" },
              { v: "failed", l: "Échec" },
            ]}
          />
          <Select
            label="Opérateur"
            value={op}
            onChange={setOp}
            options={[{ v: "", l: "Tous" }, ...OPERATORS.map((o) => ({ v: o, l: o }))]}
          />
          <Select
            label="Technologie"
            value={tech}
            onChange={setTech}
            options={[{ v: "", l: "Tous" }, ...TECHNOLOGIES.map((o) => ({ v: o, l: o }))]}
          />
        </div>

        <div className="w-full min-w-0 overflow-x-auto rounded-md border bg-card">
          {q.isPending ? (
            <div className="space-y-2 p-3">
              {[0, 1, 2].map((i) => (
                <LoadingSkeleton key={i} className="h-10" />
              ))}
            </div>
          ) : q.isError ? (
            <ErrorState message="Impossible de charger les projets." onRetry={() => q.refetch()} />
          ) : !rows.length ? (
            <EmptyState title="Aucun projet">Aucun projet ne correspond aux critères.</EmptyState>
          ) : (
            <table className="w-full min-w-[1000px] text-[13px]">
              <thead className="bg-muted text-xs text-muted-foreground">
                <tr>
                  {[
                    "", // chevron accordéon
                    "Nom du projet",
                    "Périmètre",
                    "Opérateurs",
                    "Technologies",
                    "Période",
                    "Logs importés",
                    "Captures",
                    "Statut",
                    "Actions",
                  ].map((h, i) => (
                    <th
                      key={h || `col-${i}`}
                      className={`px-4 py-2.5 text-left font-medium ${i === 0 ? "w-8" : ""}`}
                      aria-hidden={h === ""}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              {rows.map((p) => {
                const isActive = activeProject?.id === p.id;
                const ov = overlays[p.id] ?? emptyOverlay();
                const effectiveStatus = p.import_job ? p.status : (ov.status ?? p.status);
                const activeImport = p.import_job != null && ["queued", "decoding", "finalizing"].includes(p.import_job.status);
                const S = STATUS[effectiveStatus];
                // Captures : l'overlay (rapport NMF) prime quand il
                // existe. Jamais 0 par défaut — on retombe sur
                // `p.captures` du listing si pas d'overlay.
                const effectiveCaptures = p.import_job ? p.captures : (ov.captures ?? p.captures);
                // 1.6.0 — Opérateurs / Technologies : LABELS visibles.
                // Préférence B0 (`project.operators` / `project.technologies`
                // qui portent déjà les libellés Orange/SFR/LTE/NR), fallback
                // sur les clés B1-ingest (`operators_plmn` / `technos_seen`)
                // dont les clés PLMN restent BRUTES — on n'invente jamais
                // un libellé opérateur depuis un PLMN. Les deux sources
                // vides → « N/D ».
                //
                // Diagnostic 1.5.1 : la UI lisait UNIQUEMENT
                // `operators_plmn`/`technos_seen` → N/D pour tous les
                // projets seedés B0 live (dont `operators` était peuplé
                // mais `operators_plmn` absent du listing). 1.6.0 inverse
                // la priorité.
                const operatorLabels = selectOperatorLabels(p);
                const techLabels = selectTechLabels(p);
                const isOpen = expanded.has(p.id);
                // On émet un <tbody> par projet (groupant la ligne
                // principale + la ligne "détail" quand elle est
                // ouverte) pour garder la sémantique HTML
                // <table>→<tbody>→<tr> sans wrapper <div>.
                return (
                  <tbody key={p.id}>
                    <tr
                      className={`border-t transition-colors ${isActive ? "bg-green-50 hover:bg-green-100/70 dark:bg-green-950/30 dark:hover:bg-green-950/50" : "hover:bg-muted/50"}`}
                    >
                      <td className="px-2 py-3 align-top">
                        <button
                          type="button"
                          onClick={() => toggleExpand(p.id)}
                          aria-expanded={isOpen}
                          aria-controls={`project-row-details-${p.id}`}
                          aria-label={
                            isOpen
                              ? `Masquer le détail d'ingestion de ${p.name}`
                              : `Afficher le détail d'ingestion de ${p.name}`
                          }
                          className="flex h-8 w-8 items-center justify-center rounded-md border hover:bg-muted"
                        >
                          {isOpen ? (
                            <ChevronDown className="h-4 w-4" aria-hidden />
                          ) : (
                            <ChevronRowClosed className="h-4 w-4" aria-hidden />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-semibold">{p.name}</td>
                      <td className="max-w-48 px-4 py-3 text-xs text-muted-foreground">
                        {p.geography || "N/D"}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {operatorLabels.length === 0 ? (
                          <span className="text-muted-foreground">N/D</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {operatorLabels.map((label) => (
                              <OperatorChip key={label} label={label} />
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {techLabels.length === 0 ? (
                          <span className="text-muted-foreground">N/D</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {techLabels.map((label) => (
                              <TechBadge key={label} label={label} />
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="num px-4 py-3 text-xs leading-tight text-muted-foreground">
                        {fmtDate(p.periodStart)}
                        <br />
                        {fmtDate(p.periodEnd)}
                      </td>
                      <td className="num px-4 py-3" title="Fichiers NMF décodés avec succès">
                        {p.n_files == null ? "N/D" : p.n_files.toLocaleString("fr-FR")}
                      </td>
                      <td className="num px-4 py-3">{fmtCount(effectiveCaptures)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <span
                            className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${S.c}`}
                          >
                            <S.i className="h-3.5 w-3.5" />
                            {S.l}
                          </span>
                          {p.import_job && (
                            <span className="text-xs text-muted-foreground" role="status">
                              {importProgressLabel(p.import_job)}
                            </span>
                          )}
                          {p.import_job?.error_msg && (
                            <span className="text-xs text-destructive">{p.import_job.error_msg}</span>
                          )}
                          {ov.errorMsg && (
                            <span
                              className="inline-flex items-center gap-1 text-[11px] text-destructive"
                              title={ov.errorMsg}
                            >
                              <AlertTriangle className="h-3 w-3" aria-hidden />
                              <span className="max-w-56 truncate font-mono">{ov.errorMsg}</span>
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            aria-pressed={isActive}
                            onClick={() => { if (!isActive) open(p); }}
                            className={`flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md border px-3 text-xs font-semibold transition-colors ${isActive ? "border-green-700 bg-green-700 text-white hover:bg-green-800 dark:border-green-600 dark:bg-green-600 dark:hover:bg-green-700" : "border-primary text-primary hover:bg-accent"}`}
                          >
                            {isActive ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : <FolderOpen className="h-3.5 w-3.5" aria-hidden />}
                            {isActive ? "Projet actif" : "Ouvrir"}
                          </button>
                          <ProjectRowNmfAction
                            projectId={p.id}
                            projectName={p.name}
                            disabled={activeImport}
                            onStart={() => handleStart(p.id)}
                            onReport={(r) => handleReport(p.id, r)}
                            onError={(m) => handleError(p.id, m)}
                          />
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                aria-label={`Plus d'actions pour ${p.name}`}
                                className="flex h-8 w-8 items-center justify-center rounded-md border hover:bg-muted"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              <DropdownMenuItem
                                onSelect={(e) => {
                                  e.preventDefault();
                                  setTimeout(() => setSsProject(p), 0);
                                }}
                              >
                                <Layers className="h-4 w-4" aria-hidden />
                                {t("superstream.createTitle")}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() => setExpanded((prev) => new Set(prev).add(p.id))}
                              >
                                <Layers className="h-4 w-4" aria-hidden />
                                {t("superstream.manage")}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={(e) => {
                                  // Empêche la fermeture synchrone qui
                                  // casse le focus de l'AlertDialog qu'on
                                  // va ouvrir juste après — on diffère
                                  // l'ouverture d'un tick.
                                  e.preventDefault();
                                  setTimeout(() => setPendingDelete(p), 0);
                                }}
                                className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" aria-hidden />
                                Supprimer le projet
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr id={`project-row-details-${p.id}`} className="border-t">
                        <td colSpan={10} className="p-0">
                          <div className="bg-muted/30 px-4 pt-4">
                            <SuperstreamTree projectId={p.id} projectName={p.name} highlightId={ssHighlight[p.id] ?? null} />
                          </div>
                          <ProjectRowDetails project={p} open={isOpen} />
                        </td>
                      </tr>
                    )}
                  </tbody>
                );
              })}
            </table>
          )}
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-xs text-muted-foreground">
          <span className="min-w-0">
            Affichage de 1 à {rows.length} sur {rows.length} projets
          </span>
          <div className="flex shrink-0 items-center gap-1">
            <button aria-label="Page précédente" className="p-1.5">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              1
            </span>
            <button aria-label="Page suivante" className="p-1.5">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
      <CreateProjectDialog
        open={showCreate}
        onClose={() => {
          if (createM.status !== "pending") setShowCreate(false);
        }}
        onCreate={(name) => createM.mutate(name)}
        busy={createM.status === "pending"}
        error={createM.status === "error" ? createM.error : null}
      />
      {/* 1.6.0 — Dialog de confirmation de suppression. L'instance est
          montée en permanence et pilotée par `pendingDelete` : la
          promesse `onConfirm` RÉSOUT en succès (invalide la liste
          projets, émet la notif) et REJETTE en erreur (reste ouverte
          avec un message `toUserMessage`). */}
      {ssProject && (
        <SuperstreamDialog
          open
          projectId={ssProject.id}
          projectName={ssProject.name}
          existing={ssList.data ?? []}
          editing={null}
          onClose={() => setSsProject(null)}
          onSaved={(created) => {
            const pid = ssProject.id;
            setSsProject(null);
            void qc.invalidateQueries({ queryKey: superstreamsKey(pid) });
            setExpanded((prev) => new Set(prev).add(pid));
            setSsHighlight((prev) => ({ ...prev, [pid]: created.id }));
            toast.success(t("superstream.created"));
          }}
        />
      )}
      <DeleteProjectDialog
        open={pendingDelete !== null}
        projectName={pendingDelete?.name ?? ""}
        onClose={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return;
          await deleteM.mutateAsync({ id: pendingDelete.id, name: pendingDelete.name });
        }}
      />
      {notice && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-md border border-sev-good/40 bg-background px-3 py-2 text-sm shadow-lg"
        >
          <CheckSuccess className="h-4 w-4 text-sev-good" aria-hidden />
          <span>{notice}</span>
        </div>
      )}
    </div>
  );
}
