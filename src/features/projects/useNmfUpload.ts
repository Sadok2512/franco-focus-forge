// Hook partagé pour l'upload NMF (B1-ingest, complément 1.5.0).
//
// Pourquoi un hook plutôt qu'une duplication ?
//   La page détail projet (NmfImportPanel) ET la ligne de la liste
//   projets (ProjectRowNmfAction) doivent exercer EXACTEMENT la même
//   mécanique : même adaptateur (`uploadNmfFiles` du client.ts), même
//   progression XHR cumulée, même classification d'erreur
//   (`toUserMessage` → 401 purge+redirect, réseau → injoignable,
//   4xx/5xx → code HTTP + message JSON du back). Le hook isole cette
//   mécanique ; les deux consommateurs ne font que l'habiller.
//
// Règles dures (identiques au composant d'origine, P1-3) :
//   - `null` reste `null`. Jamais 0 par défaut (sinon la UI mentirait).
//   - L'erreur affichée vient TOUJOURS de `toUserMessage` — pas de
//     tentative de deviner la classe à l'appel.
//   - Les fichiers restés en `pending`/`decoding` au moment d'une
//     erreur HTTP sont marqués `error` localement avec le message
//     utilisateur, pour que la UI n'affiche jamais un « pending »
//     trompeur après panne.
import { useCallback, useMemo, useRef, useState } from "react";
import { uploadNmfFiles } from "@/lib/api/client";
import type { NmfFileStatus, NmfImportReport, NmfPerFileProgress } from "@/lib/api/client";
import { toUserMessage } from "@/lib/api/http";

export type NmfFileRow = {
  file: File;
  status: NmfFileStatus;
  loaded: number;
  percent: number | null;
  error_msg: string | null;
};

export type NmfUploadStatus = "idle" | "uploading" | "success" | "error";

/** État cumulé exposé par le hook. Les deux consommateurs lisent la
 *  même source de vérité — pas de divergence possible entre les deux
 *  points d'entrée. */
export type NmfUploadState = {
  rows: NmfFileRow[];
  globalError: string | null;
  report: NmfImportReport | null;
  status: NmfUploadStatus;
  /** Progression cumulée en octets (somme des `loaded`). */
  loadedBytes: number;
  /** Taille totale cumulée (somme des `file.size`). `null` si vide. */
  totalBytes: number | null;
  /** Pourcentage cumulé [0..100], ou `null` si rien à envoyer. */
  cumulativePercent: number | null;
};

export type UseNmfUploadResult = NmfUploadState & {
  /** Lance l'upload des fichiers passés. Marque toutes les lignes
   *  comme `pending` au départ pour que la UI exerce la même branche
   *  de rendu que `apiFetch`. Résout avec le rapport (ou `null` sur
   *  erreur — l'erreur reste disponible via `globalError`). */
  upload: (files: File[]) => Promise<NmfImportReport | null>;
  /** Remet le hook à zéro : les deux consommateurs reviennent à l'état
   *  initial (plus de rapport, plus d'erreur, plus de lignes). */
  reset: () => void;
};

function makeRows(files: File[]): NmfFileRow[] {
  return files.map<NmfFileRow>((f) => ({
    file: f,
    status: "pending",
    loaded: 0,
    percent: 0,
    error_msg: null,
  }));
}

export function useNmfUpload(projectId: string): UseNmfUploadResult {
  const [rows, setRows] = useState<NmfFileRow[]>([]);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [report, setReport] = useState<NmfImportReport | null>(null);
  const [status, setStatus] = useState<NmfUploadStatus>("idle");
  // Garde une référence stable au projectId le plus récent pour l'appel
  // async. Évite les captures stales si le hook est monté dans un
  // conteneur rendu plusieurs fois par ligne.
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;

  const reset = useCallback(() => {
    setRows([]);
    setGlobalError(null);
    setReport(null);
    setStatus("idle");
  }, []);

  const upload = useCallback(async (files: File[]): Promise<NmfImportReport | null> => {
    if (!files.length) return null;
    setGlobalError(null);
    setReport(null);
    setStatus("uploading");
    const initialRows = makeRows(files);
    setRows(initialRows);
    try {
      const r = await uploadNmfFiles(projectIdRef.current, files, {
        onFileProgress: (p: NmfPerFileProgress) =>
          setRows((prev) => {
            const next = [...prev];
            const row = next[p.index];
            if (!row) return prev;
            next[p.index] = {
              ...row,
              status: p.status,
              loaded: p.loaded,
              percent: p.percent,
              error_msg: p.error_msg,
            };
            return next;
          }),
      });
      setReport(r);
      setStatus("success");
      return r;
    } catch (e) {
      // Même traitement d'erreur que NmfImportPanel (P1-3) : la classe
      // est devinée par `toUserMessage`, pas par le composant.
      const userMsg = toUserMessage(e);
      setGlobalError(userMsg);
      setRows((prev) =>
        prev.map((r) =>
          r.status === "pending" || r.status === "decoding"
            ? { ...r, status: "error", error_msg: userMsg }
            : r,
        ),
      );
      setStatus("error");
      return null;
    }
  }, []);

  const { loadedBytes, totalBytes } = useMemo(() => {
    if (!rows.length) return { loadedBytes: 0, totalBytes: null as number | null };
    let loaded = 0;
    let total = 0;
    for (const r of rows) {
      loaded += r.loaded;
      total += r.file.size;
    }
    return { loadedBytes: loaded, totalBytes: total };
  }, [rows]);

  const cumulativePercent = useMemo<number | null>(() => {
    if (totalBytes == null || totalBytes <= 0) return null;
    const pct = (loadedBytes / totalBytes) * 100;
    return Math.max(0, Math.min(100, Math.round(pct)));
  }, [loadedBytes, totalBytes]);

  return {
    rows,
    globalError,
    report,
    status,
    loadedBytes,
    totalBytes,
    cumulativePercent,
    upload,
    reset,
  };
}
