import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, FileWarning, Upload } from "lucide-react";
import { useRef, useState } from "react";
import {
  getCellSummary,
  listCellImports,
  uploadCellReference,
  type ReferenceImportEntry,
  type UploadProgress,
} from "@/lib/api/client";
import type { CellRefUploadReport } from "@/lib/api/reference-schemas";
import { toUserMessage } from "@/lib/api/http";
import { Card, Pill, SettingsSection, btnPrimary, fmtDate } from "../shared";

// null → « N/D », jamais 0. On NE remplace jamais un chiffre absent.
const nd = (v: number | null | undefined): string =>
  typeof v === "number" && Number.isFinite(v) ? v.toLocaleString("fr-FR") : "N/D";

function BreakdownList({
  entries,
  emptyLabel,
}: {
  entries: Array<[string, number]>;
  emptyLabel: string;
}) {
  if (!entries.length) {
    return <p className="text-xs text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <ul className="divide-y rounded border bg-background text-xs">
      {entries.map(([k, n]) => (
        <li key={k} className="flex items-center justify-between px-3 py-1.5">
          <span className="truncate pr-2">{k}</span>
          <span className="font-mono">{nd(n)}</span>
        </li>
      ))}
    </ul>
  );
}

// 1.19.0 — ReportBlock aligné sur CellRefUploadReport (back 0.47.1).
// Jamais vert sur 0 ligne : si cells_affected=0, un bandeau rouge
// "rejected" porte status_reason + ventilation reject_reasons.
function ReportBlock({ report }: { report: CellRefUploadReport }) {
  const rejectedEntries = Object.entries(report.reject_reasons ?? {}).sort((a, b) => b[1] - a[1]);
  const cellsAffected = report.cells_affected ?? report.matched;
  const isRejected = report.status === "rejected";
  return (
    <div className="space-y-4">
      {isRejected && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs"
        >
          <FileWarning className="mt-0.5 h-4 w-4 text-destructive" aria-hidden />
          <div>
            <p className="font-semibold text-destructive">
              Import rejeté — aucune cellule affectée en base
            </p>
            <p className="text-destructive/90 mt-0.5">
              Motif : {report.status_reason ?? "(aucune raison fournie)"}
            </p>
            {rejectedEntries.length > 0 && (
              <ul className="mt-1 flex flex-wrap gap-1">
                {rejectedEntries.map(([k, n]) => (
                  <li key={k}>
                    <Pill tone="warn">
                      <span className="font-mono">{k}</span>
                      &nbsp;· {nd(n)}
                    </Pill>
                  </li>
                ))}
              </ul>
            )}
            {report.source_path && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Blob source persisté : <code>{report.source_path}</code>
              </p>
            )}
          </div>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-4">
        <Card title="Lignes CSV lues">
          <p className="text-xl font-semibold">{nd(report.processed)}</p>
          <p className="text-[11px] text-muted-foreground">processed</p>
        </Card>
        <Card title="Cellules affectées">
          <p className={`text-xl font-semibold ${cellsAffected > 0 ? "text-sev-good" : "text-destructive"}`}>
            {nd(cellsAffected)}
          </p>
          <p className="text-[11px] text-muted-foreground">
            inserted {nd(report.inserted)} · updated {nd(report.updated_lines ?? 0)}
          </p>
        </Card>
        <Card title="Rejetées / ambiguës / vides">
          <p className="text-xl font-semibold text-destructive">
            {nd(report.rejected)}
            {report.ambiguous !== undefined && ` + ${nd(report.ambiguous)}`}
            {report.skipped_empty !== undefined && ` + ${nd(report.skipped_empty)}`}
          </p>
          <p className="text-[11px] text-muted-foreground">rejected · ambiguous · skipped_empty</p>
        </Card>
        <Card title="Référence">
          <p className="text-sm">
            id&nbsp;: <span className="font-mono text-[11px]">{report.reference_id}</span>
          </p>
          {report.source_path && (
            <p className="text-[11px] text-muted-foreground break-all">
              <span className="font-mono">{report.source_path}</span>
            </p>
          )}
        </Card>
      </div>

      {rejectedEntries.length > 0 && !isRejected && (
        <div className="grid gap-3 md:grid-cols-1">
          <Card title="Rejets par motif (import partiel)">
            <BreakdownList entries={rejectedEntries} emptyLabel="Aucun rejet." />
          </Card>
        </div>
      )}
      {report.warnings && report.warnings.length > 0 && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-sev-warn/40 bg-sev-warn/10 p-3 text-xs text-sev-warn"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4" aria-hidden />
          <div>
            <p className="font-semibold">Warnings de parsing :</p>
            <ul className="list-disc pl-4">
              {report.warnings.map((w, i) => (
                <li key={i} className="text-muted-foreground">{w}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function ImportsHistory({ imports }: { imports: ReferenceImportEntry[] }) {
  if (!imports.length) {
    return <p className="text-xs text-muted-foreground">Aucun import pour l'instant.</p>;
  }
  return (
    <div className="overflow-x-auto rounded border bg-card">
      <table className="w-full border-collapse text-xs">
        <thead className="bg-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Fichier</th>
            <th className="px-3 py-2">Snapshot</th>
            <th className="px-3 py-2">Acteur</th>
            <th className="px-3 py-2 text-right">Lues</th>
            <th className="px-3 py-2 text-right">Chargées</th>
            <th className="px-3 py-2 text-right">Rejetées</th>
            <th className="px-3 py-2">Statut</th>
            <th className="px-3 py-2">Date</th>
          </tr>
        </thead>
        <tbody>
          {imports.map((i) => {
            const unmapped = Object.keys(i.report.bands_unmapped).length;
            return (
              <tr key={i.id} className="border-t">
                <td className="px-3 py-2">
                  <div className="font-medium">{i.filename}</div>
                  {unmapped > 0 && (
                    <div className="mt-1">
                      <Pill tone="warn">{unmapped} bande(s) hors mapping</Pill>
                    </div>
                  )}
                </td>
                <td className="px-3 py-2">{i.snapshot_date ?? "N/D"}</td>
                <td className="px-3 py-2">{i.actor}</td>
                <td className="px-3 py-2 text-right font-mono">{nd(i.rows_read)}</td>
                <td className="px-3 py-2 text-right font-mono text-sev-good">
                  {nd(i.rows_loaded)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-destructive">
                  {nd(i.rows_rejected)}
                </td>
                <td className="px-3 py-2">
                  <Pill tone={i.status === "completed" ? "good" : "warn"}>{i.status}</Pill>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{fmtDate(i.uploaded_at)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const fmtBytes = (n: number): string => {
  if (!Number.isFinite(n)) return "N/D";
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Kio`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} Mio`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} Gio`;
};

export function CellularReferencePanel() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [lastReport, setLastReport] = useState<CellRefUploadReport | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const importsQ = useQuery({
    queryKey: ["reference", "cell", "imports"],
    queryFn: ({ signal }) => listCellImports(signal),
  });
  const summaryQ = useQuery({
    queryKey: ["reference", "cell", "summary"],
    queryFn: ({ signal }) => getCellSummary(signal),
  });

  const uploadM = useMutation<CellRefUploadReport, Error, File>({
    mutationFn: async (f: File) => {
      setUploadError(null);
      setProgress({ loaded: 0, total: f.size, percent: 0 });
      return uploadCellReference(f, {
        onProgress: (p) => setProgress(p),
      });
    },
    onSuccess: (report) => {
      setLastReport(report);
      setProgress(null);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["reference", "cell"] });
    },
    onError: (e: Error) => {
      // P1-3 : distingue 401 / réseau / 4xx-5xx. Le message réel du back
      // (ex. « HTTP 422 — En-tête CSV non conforme — rien n'a été inséré »)
      // est affiché TEL QUEL, jamais remplacé par « Backend injoignable ».
      setUploadError(toUserMessage(e));
      setProgress(null);
    },
  });

  const uploading = uploadM.status === "pending";

  return (
    <div className="space-y-6">
      <SettingsSection
        title="Référence cellulaire"
        description="Upload du CSV 4G/5G (jusqu'à 256 Mo). Le fichier est streamé, l'en-tête est validé avant l'ingestion ; les lignes rejetées sont motivées, les bandes hors mapping déclarées en écart ouvert."
      >
        <Card>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[260px] space-y-1">
              <label htmlFor="cell-ref-file" className="block text-xs font-medium">
                Fichier CSV
              </label>
              <input
                id="cell-ref-file"
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                className="block w-full text-xs file:mr-3 file:rounded-md file:border file:bg-card file:px-3 file:py-1.5 file:text-xs file:font-medium hover:file:bg-muted"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFile(f);
                  setUploadError(null);
                }}
              />
              {file && (
                <p className="text-[11px] text-muted-foreground">
                  Sélectionné : <span className="font-mono">{file.name}</span> —{" "}
                  {fmtBytes(file.size)}
                </p>
              )}
            </div>
            <button
              type="button"
              className={btnPrimary}
              disabled={!file || uploading}
              onClick={() => file && uploadM.mutate(file)}
            >
              <Upload className="h-3.5 w-3.5" aria-hidden />
              {uploading ? "Upload en cours…" : "Uploader la référence"}
            </button>
          </div>

          {uploading && progress && (
            <div className="mt-4 space-y-1" role="status" aria-live="polite">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>
                  Envoi : {fmtBytes(progress.loaded)} / {fmtBytes(progress.total)}
                </span>
                <span>{progress.percent == null ? "…" : `${progress.percent}%`}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-[width]"
                  style={{
                    width:
                      progress.percent == null
                        ? "100%"
                        : `${Math.min(100, Math.max(0, progress.percent))}%`,
                  }}
                />
              </div>
            </div>
          )}

          {uploadError && (
            <div
              role="alert"
              className="mt-4 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4" aria-hidden />
              <span>Échec de l'upload : {uploadError}</span>
            </div>
          )}

          {uploadM.status === "success" && lastReport && lastReport.status === "ok" && (
            <div className="mt-4 flex items-center gap-2 rounded-md border border-sev-good/40 bg-sev-good/10 p-3 text-xs text-sev-good">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              <span>
                Upload accepté — {nd(lastReport.cells_affected ?? lastReport.matched)} cellule(s) écrite(s)
                en base ({nd(lastReport.inserted)} insert, {nd(lastReport.updated_lines ?? 0)} update)
                sur {nd(lastReport.processed)} lignes CSV lues.
              </span>
            </div>
          )}
        </Card>

        {lastReport && (
          <section className="mt-6 space-y-3">
            <h3 className="text-sm font-semibold">Rapport du dernier upload</h3>
            <ReportBlock report={lastReport} />
          </section>
        )}
      </SettingsSection>

      <SettingsSection
        title="Historique des imports"
        description="Chaque upload laisse une trace : fichier, acteur, snapshot, comptes et rapport complet."
      >
        {importsQ.isLoading ? (
          <p className="text-xs text-muted-foreground">Chargement…</p>
        ) : importsQ.isError ? (
          <p className="text-xs text-destructive">Impossible de charger l'historique.</p>
        ) : (
          <ImportsHistory imports={importsQ.data ?? []} />
        )}
      </SettingsSection>

      <SettingsSection
        title="Résumé de la base de référence"
        description="Totaux et répartitions actuelles en base. Les lignes sans valeur sont déclarées « N/D », jamais 0."
      >
        {summaryQ.isLoading ? (
          <p className="text-xs text-muted-foreground">Chargement…</p>
        ) : summaryQ.isError ? (
          <p className="text-xs text-destructive">Impossible de charger le résumé.</p>
        ) : summaryQ.data ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Card title={`Par RAT · total ${nd(summaryQ.data.total)}`}>
              <BreakdownList
                entries={summaryQ.data.by_rat.map((b) => [b.key, b.count])}
                emptyLabel="Aucune cellule."
              />
            </Card>
            <Card title="Par bande 3GPP">
              <BreakdownList
                entries={summaryQ.data.by_band_3gpp.map((b) => [b.key, b.count])}
                emptyLabel="Aucune cellule."
              />
            </Card>
            <Card title="Par DOR">
              <BreakdownList
                entries={summaryQ.data.by_dor.map((b) => [b.key, b.count])}
                emptyLabel="Aucune cellule."
              />
            </Card>
            <Card title="Par DR">
              <BreakdownList
                entries={summaryQ.data.by_dr.map((b) => [b.key, b.count])}
                emptyLabel="Aucune cellule."
              />
            </Card>
          </div>
        ) : null}
      </SettingsSection>
    </div>
  );
}
