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

  const handleFiles = async (fs: FileList | null) => {
    if (!fs || !fs.length) return;
    const files = Array.from(fs);
    onStart?.();
    const r = await nmf.upload(files);
    // Réinitialise la valeur de l'input pour permettre un re-pick
    // identique (sinon onChange ne refire pas).
    if (inputRef.current) inputRef.current.value = "";
    if (!r) {
      // Erreur : le hook a stocké le message utilisateur.
      onError(nmf.globalError ?? "Erreur inconnue");
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
        accept=".nmf,application/octet-stream"
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
          ? nmf.cumulativePercent == null
            ? "Envoi…"
            : `Envoi ${nmf.cumulativePercent}%`
          : "Ajouter des logs"}
      </button>
      {nmf.status === "error" && nmf.globalError && (
        <span
          role="alert"
          className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive"
          title={nmf.globalError}
        >
          <AlertTriangle className="h-3 w-3" aria-hidden />
          Échec import
        </span>
      )}
    </div>
  );
}
