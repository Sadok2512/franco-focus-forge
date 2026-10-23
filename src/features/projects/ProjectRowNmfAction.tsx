// Action « Ajouter des logs » dans la colonne Actions de la liste
// projets (complément 1.5.0). Consomme EXACTEMENT le même hook
// (`useNmfUpload`) que `NmfImportPanel` : zéro duplication de la
// mécanique d'upload / progression / erreur.
//
// Comportement attendu :
//   - clic → ouvre un `<input type="file">` masqué (multi-sélection) ;
//   - pendant l'envoi : la ligne affiche « Traitement » + un %
//     cumulé (somme des octets envoyés / taille totale) ;
//   - après succès : le parent reçoit le `NmfImportReport` ET le
//     statut final de la ligne, pour mettre à jour Captures + Statut
//     depuis le rapport (`n_captures`) ou le projet rafraîchi ;
//   - après échec HTTP : la ligne revient à son état précédent et
//     affiche un badge d'erreur dérivé de `toUserMessage` (401 /
//     réseau / 4xx-5xx avec `detail.message`). Jamais de reset
//     silencieux.
import { AlertTriangle, Loader2, Upload } from "lucide-react";
import { useId, useRef } from "react";
import type { NmfImportReport } from "@/lib/api/client";
import { importProgressLabel } from "./shared";
import { useNmfUpload } from "./useNmfUpload";

export type ProjectRowNmfReport = {
  report: NmfImportReport;
  /** Statut dérivé pour la ligne — règles :
   *    - au moins un fichier en échec → "error" (+ premier error_msg) ;
   *    - sinon → null (le parent lira le `status` du projet rafraîchi). */
  derivedStatus: "error" | null;
  firstErrorMsg: string | null;
};

export function ProjectRowNmfAction({
  projectId,
  projectName,
  onReport,
  onError,
  onStart,
  disabled,
}: {
  projectId: string;
  projectName: string;
  onReport: (r: ProjectRowNmfReport) => void;
  /** Appelé en cas d'échec HTTP (401, réseau, 4xx-5xx) avec le
   *  message utilisateur déjà passé par `toUserMessage`. */
  onError: (userMsg: string) => void;
  /** Appelé juste après le pick, AVANT que l'upload ne commence —
   *  permet au parent de marquer la ligne « Traitement ». */
  onStart?: () => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const nmf = useNmfUpload(projectId);
  const uploading = nmf.status === "uploading";

  const openPicker = () => {
    if (!inputRef.current || inputRef.current.disabled) return;
    inputRef.current.click();
  };

  // 1.105.9 — ZIP ouvert côté client (JSZip, lazy import). Dossier via
  // webkitdirectory : la FileList est déjà aplatie, on filtre les .nmf.
  const expandOne = async (f: File): Promise<File[]> => {
    const lower = f.name.toLowerCase();
    if (lower.endsWith(".nmf")) return [f];
    if (lower.endsWith(".zip")) {
      const { default: JSZip } = await import("jszip");
      const zip = await JSZip.loadAsync(f);
      const out: File[] = [];
      for (const entry of Object.values(zip.files)) {
        if (entry.dir) continue;
        if (!entry.name.toLowerCase().endsWith(".nmf")) continue;
        const blob = await entry.async("blob");
        const basename = entry.name.split("/").pop() ?? entry.name;
        out.push(new File([blob], basename, { type: "application/octet-stream" }));
      }
      if (!out.length) throw new Error(`Aucun .nmf trouvé dans ${f.name}`);
      return out;
    }
    return [];
  };
  const handleFiles = async (fs: FileList | null) => {
    if (!fs || !fs.length) return;
    let files: File[];
    try {
      files = (await Promise.all(Array.from(fs).map(expandOne))).flat();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
      return;
    }
    if (!files.length) return;
    onStart?.();
    const r = await nmf.upload(files, onError);
    // Réinitialise la valeur de l'input pour permettre un re-pick
    // identique (sinon onChange ne refire pas).
    if (inputRef.current) inputRef.current.value = "";
    if (!r) {
      // Le hook a déjà transmis l'erreur de cet appel à onError.
      return;
    }
    const firstErr = r.by_file.find((f) => f.status === "error");
    onReport({
      report: r,
      derivedStatus: r.files_error > 0 ? "error" : null,
      firstErrorMsg: firstErr?.error_msg ?? null,
    });
  };

  return (
    <div className="inline-flex items-center gap-2">
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        multiple
        accept=".nmf,.zip,application/zip,application/octet-stream"
        className="sr-only"
        disabled={disabled || uploading}
        onChange={(e) => void handleFiles(e.target.files)}
      />
      <button
        type="button"
        onClick={openPicker}
        disabled={disabled || uploading}
        aria-label={`Ajouter des logs NMF au projet ${projectName}`}
        className="flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-semibold hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
      >
        {uploading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <Upload className="h-3.5 w-3.5" aria-hidden />
        )}
        {uploading
          ? nmf.jobProgress
            ? importProgressLabel(nmf.jobProgress)
            : nmf.cumulativePercent === 100
              ? "Envoi terminé, réception…"
              : `Envoi ${nmf.cumulativePercent ?? 0}%`
          : "Ajouter des logs"}
      </button>
      {nmf.status === "error" && nmf.globalError && (
        <span
          role="alert"
          className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive"
          title={nmf.globalError}
        >
          <AlertTriangle className="h-3 w-3" aria-hidden />
          Requête d’import échouée
        </span>
      )}
    </div>
  );
}
