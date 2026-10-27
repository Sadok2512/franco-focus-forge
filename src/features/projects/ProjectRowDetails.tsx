import { DecodePanel } from "./DecodePanel";
// 1.5.1 — Détail d'ingestion déplié dans la liste projets.
//
// Composant « accordéon » monté UNIQUEMENT quand la ligne est ouverte
// (lazy fetch via `useQuery({ enabled: open })`). Objectif : ne pas tirer
// un rapport NMF par projet au premier rendu — un seul XHR par projet,
// à l'ouverture.
//
// Règles 1.5.1 (dérivées du lot B1-ingest) :
//   - les totaux (`n_captures_ingest`, `n_events_ingest`,
//     `gps_coverage_pct`) viennent du Project (déjà listé), pas du
//     rapport : le rapport n'ajoute QUE le détail par fichier et les
//     breakdowns opérateurs/technos finement comptés. `null` → « N/D »,
//     jamais 0.
//   - un fichier `status: "error"` expose son `error_msg` TEL QUEL
//     (pas d'avalement, pas de « Erreur » générique).
//   - les PLMN sont BRUTS (`20801`, `20810`…) tant qu'une table de
//     référence PLMN→opérateur n'est pas branchée côté back (écart
//     explicitement déclaré au CHANGELOG 1.5.1).
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Clock, Info } from "lucide-react";
import { getFileSummary, getImportReport } from "@/lib/api/client";
import type { FileSummaryCell } from "@/lib/api/file-summary-schemas";
import type { Project } from "@/lib/api/schemas";
import { toUserMessage } from "@/lib/api/http";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { OperatorChip, TechBadge, nd, ndPct, sortByCountDesc } from "./shared";

// Pagination du tableau « Fichiers importés » : 10 lignes par page, navigation
// précédent/suivant. Le découpage est une fonction pure exportée pour les tests.
export const IMPORT_FILES_PAGE_SIZE = 10;

const SUMMARY_COLUMNS = [
  "task",
  "dl_total",
  "dl_lte",
  "dl_nr",
  "ul_total",
  "ul_lte",
  "ul_nr",
  "mos",
  "rach_fail",
  "call_setup_fail",
  "voice_drop",
  "session_fail",
  "latency",
] as const;

function SummaryHeader({ code }: { code: (typeof SUMMARY_COLUMNS)[number] }) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center justify-end gap-1 whitespace-nowrap">
      {t(`projectImport.summary.${code}.label`)}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={t(`projectImport.summary.${code}.definition`)}
          >
            <Info className="h-3 w-3" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-72 normal-case tracking-normal">
          {t(`projectImport.summary.${code}.definition`)}
        </TooltipContent>
      </Tooltip>
    </span>
  );
}

function SummaryValue({
  code,
  cell,
}: {
  code: (typeof SUMMARY_COLUMNS)[number];
  cell: FileSummaryCell | undefined;
}) {
  const { t, i18n } = useTranslation();
  if (!cell || cell.value == null) {
    return (
      <span className="text-muted-foreground" title={cell?.reason ?? undefined}>
        —
      </span>
    );
  }
  let rendered: string;
  if (code === "task")
    rendered = t(`projectImport.task.${String(cell.value)}`, { defaultValue: String(cell.value) });
  else if (["rach_fail", "call_setup_fail", "voice_drop", "session_fail"].includes(code))
    rendered = `${cell.value} / ${cell.n}`;
  else
    rendered = Number(cell.value).toLocaleString(i18n.language, {
      maximumFractionDigits: code === "mos" ? 2 : 1,
    });
  const details = [
    `${t("projectImport.summary.source")}: ${cell.source_event}`,
    cell.n == null ? null : `n = ${cell.n}`,
    cell.max == null
      ? null
      : `${t("projectImport.summary.max")}: ${cell.max.toLocaleString(i18n.language, { maximumFractionDigits: 2 })} ${cell.unit ?? ""}`,
    `query_id: ${cell.query_id}`,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <span className="whitespace-nowrap font-mono tabular-nums" title={details}>
      {rendered}
    </span>
  );
}

export function paginateImportFiles<T>(
  files: T[],
  page: number,
): { page: number; pageCount: number; rows: T[] } {
  const pageCount = Math.max(1, Math.ceil(files.length / IMPORT_FILES_PAGE_SIZE));
  const safePage = Math.min(Math.max(0, page), pageCount - 1);
  return {
    page: safePage,
    pageCount,
    rows: files.slice(safePage * IMPORT_FILES_PAGE_SIZE, (safePage + 1) * IMPORT_FILES_PAGE_SIZE),
  };
}

function StatusBadge({ status }: { status: "pending" | "decoding" | "done" | "error" }) {
  const map = {
    done: { l: "done", c: "bg-sev-good/15 text-sev-good", Icon: CheckCircle2 },
    error: { l: "error", c: "bg-destructive/10 text-destructive", Icon: AlertTriangle },
    decoding: { l: "decoding", c: "bg-muted text-muted-foreground", Icon: Clock },
    pending: { l: "pending", c: "bg-muted text-muted-foreground", Icon: Clock },
  } as const;
  const { l, c, Icon } = map[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${c}`}
    >
      <Icon className="h-3 w-3" aria-hidden /> {l}
    </span>
  );
}

export function ProjectRowDetails({ project, open }: { project: Project; open: boolean }) {
  // Lazy fetch : on n'appelle `/projects/{id}/import` que quand la ligne
  // est ouverte. `enabled: open` garantit qu'un refetch n'arrive pas tant
  // que l'utilisateur n'a pas déplié.
  const q = useQuery({
    queryKey: ["project", project.id, "import"],
    queryFn: ({ signal }) => getImportReport(project.id, signal),
    enabled: open,
    staleTime: 30_000,
  });

  const { t } = useTranslation();
  const [filesPage, setFilesPage] = useState(0);
  // Changement de projet : on repart toujours à la première page.
  useEffect(() => setFilesPage(0), [project.id]);
  const filesPaging = paginateImportFiles(q.data?.by_file ?? [], filesPage);
  const summary = useQuery({
    queryKey: ["project", project.id, "files-summary", filesPaging.page],
    queryFn: ({ signal }) =>
      getFileSummary(
        project.id,
        filesPaging.page * IMPORT_FILES_PAGE_SIZE,
        IMPORT_FILES_PAGE_SIZE,
        signal,
      ),
    enabled: open,
    staleTime: 30_000,
  });
  const summaryByFilename = new Map(summary.data?.files.map((file) => [file.filename, file]) ?? []);

  const technosFromProject = sortByCountDesc(project.technos_seen ?? undefined);
  const operatorsFromProject = sortByCountDesc(project.operators_plmn ?? undefined);

  return (
    <div className="space-y-4 bg-muted/30 p-4">
      {open && <DecodePanel projectId={project.id} />}
      {/* Totaux issus de Project (déjà listé) — pas de nouvelle requête. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border bg-background p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Captures ingérées
          </p>
          <p className="mt-1 text-lg font-semibold">{nd(project.n_captures_ingest ?? null)}</p>
        </div>
        <div className="rounded-md border bg-background p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Événements</p>
          <p className="mt-1 text-lg font-semibold">{nd(project.n_events_ingest ?? null)}</p>
        </div>
        <div className="rounded-md border bg-background p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Couverture GPS
          </p>
          <p className="mt-1 text-lg font-semibold">{ndPct(project.gps_coverage_pct ?? null)}</p>
          <p className="text-[10px] italic text-muted-foreground">
            {project.gps_coverage_pct == null
              ? "indoor pur ou GPS absent — jamais 0 %"
              : "fix GPS valide / captures"}
          </p>
        </div>
      </div>

      {/* Technologies — 1.6.0 : badges partagés (`TechBadge`) + count
          brut à côté, tri par count décroissant. Le composant chip est
          le MÊME que celui de la liste projets (zéro duplication). */}
      <div>
        <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
          Technologies
        </p>
        {technosFromProject.length === 0 ? (
          <span className="text-xs text-muted-foreground">N/D</span>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            {technosFromProject.map(([k, n]) => (
              <span key={k} className="inline-flex items-center gap-1">
                <TechBadge label={k} />
                <span className="font-mono text-[11px] text-muted-foreground">{nd(n)}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Opérateurs — 1.6.0 : chip partagé (`OperatorChip`) + count. Si
          la clé est un PLMN brut (non reconnu), la chip retombe sur un
          neutre slate — règle « jamais inventer un libellé ». */}
      <div>
        <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Opérateurs</p>
        {operatorsFromProject.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            N/D{" "}
            <span className="italic">
              (le décodeur <span className="font-mono">bc4-decoder 1.0.0</span> n&apos;expose pas de
              PLMN pour ce projet)
            </span>
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            {operatorsFromProject.map(([plmn, n]) => (
              <span key={plmn} className="inline-flex items-center gap-1">
                <OperatorChip label={plmn} />
                <span className="font-mono text-[11px] text-muted-foreground">{nd(n)}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Fichiers importés — lazy fetch de /projects/{id}/import. */}
      <div>
        <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
          Fichiers importés
        </p>
        {q.isPending ? (
          <p className="text-xs text-muted-foreground">Chargement du détail d&apos;import…</p>
        ) : q.isError ? (
          <p role="alert" className="text-xs text-destructive">
            {toUserMessage(q.error)}
          </p>
        ) : !q.data || q.data.by_file.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Aucun fichier d&apos;ingestion n&apos;est référencé pour ce projet.
          </p>
        ) : (
          <TooltipProvider delayDuration={150}>
            <div>
              {summary.isError && (
                <p role="alert" className="mb-1 text-xs text-destructive">
                  {toUserMessage(summary.error)}
                </p>
              )}
              <div className="overflow-x-auto rounded-md border bg-background">
                <table className="w-full border-collapse text-xs">
                  <thead className="bg-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Fichier</th>
                      <th className="px-3 py-2">Statut</th>
                      <th className="px-3 py-2 text-right">Captures</th>
                      <th className="px-3 py-2 text-right">Événements</th>
                      <th className="px-3 py-2 text-right">GPS</th>
                      <th className="px-3 py-2">Décodeur</th>
                      {SUMMARY_COLUMNS.map((code) => (
                        <th key={code} className="px-3 py-2 text-right">
                          <SummaryHeader code={code} />
                        </th>
                      ))}
                      <th className="px-3 py-2">Erreur</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filesPaging.rows.map((f) => {
                      const fileSummary = summaryByFilename.get(f.filename);
                      return (
                        <tr key={f.filename} className="border-t hover:bg-muted/30">
                          <td
                            className="max-w-96 truncate px-3 py-2 font-medium"
                            title={f.filename}
                          >
                            {f.filename}
                          </td>
                          <td className="px-3 py-2">
                            <StatusBadge status={f.status} />
                          </td>
                          <td className="px-3 py-2 text-right font-mono">{nd(f.n_captures)}</td>
                          <td className="px-3 py-2 text-right font-mono">{nd(f.n_events)}</td>
                          <td className="px-3 py-2 text-right font-mono">{nd(f.n_gps)}</td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {f.decoder_version ?? "N/D"}
                          </td>
                          {SUMMARY_COLUMNS.map((code) => (
                            <td key={code} className="px-3 py-2 text-right">
                              {summary.isPending ? (
                                <span className="text-muted-foreground">…</span>
                              ) : (
                                <SummaryValue code={code} cell={fileSummary?.cells[code]} />
                              )}
                            </td>
                          ))}
                          <td className="px-3 py-2 font-mono text-destructive">
                            {f.error_msg ?? "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {q.data.by_file.length > IMPORT_FILES_PAGE_SIZE && (
                  <nav
                    className="flex items-center justify-between gap-2 border-t px-3 py-1.5"
                    aria-label={t("projectImport.filesPagination")}
                  >
                    <span className="text-[11px] text-muted-foreground">
                      {t("projectImport.showingFiles", {
                        from: filesPaging.page * IMPORT_FILES_PAGE_SIZE + 1,
                        to: filesPaging.page * IMPORT_FILES_PAGE_SIZE + filesPaging.rows.length,
                        total: q.data.by_file.length,
                      })}
                    </span>
                    <span className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-6 w-6"
                        aria-label={t("projectImport.previousPage")}
                        disabled={filesPaging.page === 0}
                        onClick={() => setFilesPage(filesPaging.page - 1)}
                      >
                        <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                      <span className="px-1 text-[11px] text-muted-foreground">
                        {t("projectImport.pageOf", {
                          page: filesPaging.page + 1,
                          total: filesPaging.pageCount,
                        })}
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-6 w-6"
                        aria-label={t("projectImport.nextPage")}
                        disabled={filesPaging.page >= filesPaging.pageCount - 1}
                        onClick={() => setFilesPage(filesPaging.page + 1)}
                      >
                        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                    </span>
                  </nav>
                )}
              </div>
            </div>
          </TooltipProvider>
        )}
      </div>
    </div>
  );
}
