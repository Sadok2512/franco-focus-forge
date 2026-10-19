import { importProgressLabel } from "./shared";
import { AlertTriangle, CheckCircle2, FileUp, Loader2, Upload, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useNmfUpload, type NmfFileRow } from "./useNmfUpload";
import type { NmfFileStatus, NmfImportReport } from "@/lib/api/client";
import { Card, fmtBytes, nd } from "./shared";

// NB (complément 1.5.0) : la mécanique d'upload (progression XHR,
// réconciliation `by_file`, classification `toUserMessage`) vit dans
// `useNmfUpload`. Ce composant ne fait qu'habiller le hook pour la
// page détail projet. La ligne de la liste projets consomme le même
// hook via `ProjectRowNmfAction`.

const STATUS_LABEL: Record<NmfFileStatus, string> = {
  pending: "En attente",
  decoding: "Décodage…",
  done: "OK",
  error: "Échec",
};

const STATUS_TONE: Record<NmfFileStatus, string> = {
  pending: "bg-muted text-muted-foreground",
  decoding: "bg-accent text-accent-foreground",
  done: "bg-sev-good/15 text-sev-good",
  error: "bg-destructive/10 text-destructive",
};

export function NmfImportPanel({
  projectId,
  onReport,
}: {
  projectId: string;
  onReport: (r: NmfImportReport) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Sélection locale indépendante : le picker ajoute aux « rangs
  // choisis », l'envoi n'a lieu qu'au clic « Importer ». Le hook ne
  // garde la liste qu'une fois la mutation lancée — on conserve donc
  // la mémoire de la file d'attente avant envoi ici.
  const [queued, setQueued] = useState<NmfFileRow[]>([]);
  const nmf = useNmfUpload(projectId);

  // Pendant l'upload : afficher les lignes vivantes du hook ; sinon,
  // afficher la file préparée par l'utilisateur. L'utilisateur voit
  // donc toujours « ses » fichiers, et pendant l'envoi la progression
  // XHR réelle.
  const uploading = nmf.status === "uploading";
  const rows: NmfFileRow[] =
    uploading || nmf.status === "success" || nmf.status === "error" ? nmf.rows : queued;

  const totalBytes = useMemo(() => rows.reduce((s, r) => s + r.file.size, 0), [rows]);

  const addFiles = (fs: FileList | null) => {
    if (!fs || !fs.length) return;
    const incoming = Array.from(fs).map<NmfFileRow>((f) => ({
      file: f,
      status: "pending",
      loaded: 0,
      percent: 0,
      error_msg: null,
    }));
    setQueued((prev) => {
      const seen = new Set(prev.map((r) => `${r.file.name}:${r.file.size}`));
      const merged = [...prev];
      for (const r of incoming) {
        const k = `${r.file.name}:${r.file.size}`;
        if (!seen.has(k)) {
          merged.push(r);
          seen.add(k);
        }
      }
      return merged;
    });
    nmf.reset();
  };

  const removeAt = (idx: number) => setQueued((prev) => prev.filter((_, i) => i !== idx));
  const clearAll = () => {
    setQueued([]);
    nmf.reset();
    if (inputRef.current) inputRef.current.value = "";
  };

  const canSend = queued.length > 0 && !uploading;

  const submit = async () => {
    const files = queued.map((r) => r.file);
    const r = await nmf.upload(files);
    if (r) onReport(r);
  };

  return (
    <Card>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[280px] flex-1 space-y-1">
          <label htmlFor="nmf-files" className="block text-xs font-medium">
            Fichiers NMF
          </label>
          <input
            id="nmf-files"
            ref={inputRef}
            type="file"
            multiple
            accept=".nmf,application/octet-stream"
            disabled={uploading}
            className="block w-full text-xs file:mr-3 file:rounded-md file:border file:bg-card file:px-3 file:py-1.5 file:text-xs file:font-medium hover:file:bg-muted"
            onChange={(e) => addFiles(e.target.files)}
          />
          <p className="text-[11px] text-muted-foreground">
            Multi-sélection acceptée. Les fichiers volumineux sont streamés via XHR ; chaque fichier
            a sa propre barre de progression ci-dessous.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={clearAll}
            disabled={!rows.length || uploading}
            className="inline-flex h-9 items-center rounded-md border bg-card px-3 text-xs font-medium hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
          >
            <X className="mr-1 h-3.5 w-3.5" aria-hidden /> Vider la liste
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSend}
            className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
          >
            <Upload className="mr-1 h-3.5 w-3.5" aria-hidden />
            {uploading
              ? "Import en cours…"
              : `Importer ${queued.length ? `(${queued.length})` : ""}`.trim()}
          </button>
        </div>
      </div>

      {totalBytes > 0 && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Total à envoyer : {fmtBytes(totalBytes)}
        </p>
      )}

      {nmf.jobProgress && (
        <p role="status" className="mt-2 text-sm">{importProgressLabel(nmf.jobProgress)}</p>
      )}
      {nmf.globalError && (
        <div
          role="alert"
          className="mt-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4" aria-hidden />
          <span>
            Échec de l'import : {nmf.globalError}. Les erreurs par fichier (le cas échéant) restent
            affichées ci-dessous.
          </span>
        </div>
      )}

      {rows.length > 0 && (
        <ul className="mt-4 space-y-2" aria-live="polite">
          {rows.map((r, i) => {
            const pct =
              r.percent == null ? null : Math.max(0, Math.min(100, Math.round(r.percent)));
            return (
              <li key={`${r.file.name}:${r.file.size}:${i}`} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <FileUp className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="truncate text-xs font-medium">{r.file.name}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      · {fmtBytes(r.file.size)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[r.status]}`}
                    >
                      {r.status === "decoding" && (
                        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                      )}
                      {r.status === "done" && <CheckCircle2 className="h-3 w-3" aria-hidden />}
                      {r.status === "error" && <AlertTriangle className="h-3 w-3" aria-hidden />}
                      {STATUS_LABEL[r.status]}
                    </span>
                    {!uploading && (
                      <button
                        type="button"
                        onClick={() => removeAt(i)}
                        className="rounded border p-1 hover:bg-muted"
                        aria-label={`Retirer ${r.file.name}`}
                      >
                        <X className="h-3 w-3" aria-hidden />
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>
                    {fmtBytes(r.loaded)} / {fmtBytes(r.file.size)}
                  </span>
                  <span>{pct == null ? "…" : `${pct}%`}</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full transition-[width] ${
                      r.status === "error" ? "bg-destructive" : "bg-primary"
                    }`}
                    style={{ width: pct == null ? "100%" : `${pct}%` }}
                  />
                </div>
                {r.error_msg && (
                  <p className="mt-2 text-[11px] text-destructive">
                    <span className="font-semibold">Erreur :</span>{" "}
                    <span className="font-mono">{r.error_msg}</span>
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {rows.length === 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          Aucun fichier sélectionné. Choisissez un ou plusieurs <code>.nmf</code> pour alimenter le
          projet. La taille cumulée n'est pas plafonnée côté UI — le backend arbitre.
        </p>
      )}

      {nmf.status === "success" && nmf.report && (
        <div className="mt-4 flex items-center gap-2 rounded-md border border-sev-good/40 bg-sev-good/10 p-3 text-xs text-sev-good">
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          <span>
            Import terminé — {nd(nmf.report.files_done)} fichier(s) ok, {nd(nmf.report.files_error)}{" "}
            en échec, {nd(nmf.report.n_captures)} capture(s) décodée(s).
          </span>
        </div>
      )}
    </Card>
  );
}
