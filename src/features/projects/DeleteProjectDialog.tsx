// 1.6.0 — Confirmation INLINE de suppression de projet. Monté par la
// liste projets (`_app.projects.tsx`) depuis le menu kebab « ... » de
// chaque ligne. Jamais `window.confirm` : la UI reste cohérente avec
// le reste de l'app (shadcn/radix AlertDialog, focus trap, ESC/overlay
// pour annuler, bouton d'action destructive explicite).
//
// Règles d'erreur (P1-3 héritée) : si `onConfirm` lève, on affiche le
// message `toUserMessage(err)` TEL QUEL en bas de la modale et on
// garde la modale ouverte — pas de fermeture silencieuse. L'appelant
// gère les cas 401 (redirect via UNAUTH_EVENT), réseau, 4xx/5xx.
import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toUserMessage } from "@/lib/api/http";

export function DeleteProjectDialog({
  open,
  projectName,
  onConfirm,
  onClose,
}: {
  open: boolean;
  projectName: string;
  /** Doit faire l'appel API et RÉSOUDRE (fermeture auto) ou REJETER (le
   *  message d'erreur reste affiché dans la modale). */
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // Reset de l'état à la (ré)ouverture — garantit qu'un échec précédent
  // n'affiche pas un message stale à l'ouverture suivante.
  useEffect(() => {
    if (open) {
      setBusy(false);
      setErrMsg(null);
    }
  }, [open]);

  const handleConfirm = async (e: React.MouseEvent<HTMLButtonElement>) => {
    // On intercepte l'auto-close de Radix pour que la modale reste
    // ouverte en cas d'erreur serveur — fermeture pilotée uniquement
    // sur succès (via `onClose()` du parent).
    e.preventDefault();
    setBusy(true);
    setErrMsg(null);
    try {
      await onConfirm();
      // Succès → le parent appellera `onClose()` lui-même (après
      // invalidation du cache).
    } catch (err) {
      setErrMsg(toUserMessage(err));
      setBusy(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(v) => (!v && !busy ? onClose() : null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden />
            Supprimer ce projet ?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                Le projet <span className="font-semibold text-foreground">{projectName}</span> et
                toutes ses données associées (fichiers NMF ingérés, événements, points de mesure,
                observations RRC) seront{" "}
                <span className="font-semibold text-destructive">supprimés définitivement</span>.
              </p>
              <p>Cette action est irréversible.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {errMsg && (
          <div
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive"
          >
            {errMsg}
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Annuler</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={busy}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive"
          >
            {busy ? "Suppression…" : "Supprimer le projet"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
