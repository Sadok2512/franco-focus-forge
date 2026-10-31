// Adaptateur pour la référence cellulaire (B1-réf).
// - Mode api : POST multipart avec progression XHR (fetch n'expose pas
//   uploadProgress côté navigateur), parse Zod systématique de la réponse.
// - Mode mock : repli local (`src/mocks/reference`), même signature.
//
// La UI ne lit la donnée que via ce module. null → la UI affiche « N/D »,
// jamais remplacé par 0.
import { z } from "zod";
import {
  ApiNetworkError,
  ApiHttpError,
  ApiSchemaError,
  apiBase,
  apiFetch,
  apiOrMock,
  getSession,
  isApiMode,
  xhrPayloadOrThrow,
} from "./http";
import {
  CellSummarySchema,
  CellReferenceJobAcceptedSchema,
  CellReferenceJobSchema,
  ImportReportSchema,
  ReferenceImportEntrySchema,
  type CellSummary,
  type ImportReport,
  type ReferenceImportEntry,
} from "./reference-schemas";
import { referenceMock } from "@/mocks/reference";

export type UploadProgress = { loaded: number; total: number; percent: number | null };

export type UploadOptions = {
  signal?: AbortSignal;
  onProgress?: (p: UploadProgress) => void;
  onJobProgress?: (status: string, percent: number) => void;
};

const JOB_POLL_MS = 1_000;

async function waitForCellReferenceJob(
  jobId: string,
  opts: UploadOptions,
): Promise<ImportReport> {
  while (true) {
    if (opts.signal?.aborted) throw Object.assign(new Error("Upload annulé"), { code: "ABORTED" });
    const job = await apiFetch(
      `/settings/cell-ref/jobs/${encodeURIComponent(jobId)}`,
      CellReferenceJobSchema,
      { signal: opts.signal },
    );
    opts.onJobProgress?.(job.status, job.progress_percent);
    if ((job.status === "completed" || job.status === "empty") && job.report) {
      return job.report;
    }
    if (job.status === "failed") {
      throw new ApiHttpError(
        job.error?.code ?? "CELL_REFERENCE_IMPORT_FAILED",
        job.error?.reason ?? "L'import du référentiel a échoué.",
        422,
        job.error,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, JOB_POLL_MS));
  }
}

/** POST /settings/cell-ref/upload — mise en file du référentiel 4G/5G.
 *
 * Le multipart est persisté puis le résultat du job d'ingestion complète est
 * suivi jusqu'à son état terminal.
 */
export async function uploadCellReference(
  file: File,
  opts: UploadOptions = {},
): Promise<ImportReport> {
  if (!isApiMode()) {
    opts.onProgress?.({ loaded: file.size, total: file.size, percent: 100 });
    const parsed = ImportReportSchema.safeParse(await referenceMock.upload(file.name));
    if (!parsed.success) throw new ApiSchemaError("mock upload shape", parsed.error.issues);
    return parsed.data;
  }

  return new Promise<ImportReport>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${apiBase()}/settings/cell-ref/upload`, true);
    const s = getSession();
    if (s) {
      xhr.setRequestHeader("Authorization", `Bearer ${s.token}`);
    }
    xhr.upload.onprogress = (ev) => {
      if (!opts.onProgress) return;
      opts.onProgress({
        loaded: ev.loaded,
        total: ev.total || file.size,
        percent: ev.lengthComputable ? Math.round((ev.loaded / ev.total) * 100) : null,
      });
    };
    xhr.onload = () => {
      // Convertit la réponse XHR en payload JSON OU en erreur typée
      // (ApiUnauthenticatedError sur 401, ApiHttpError sur 4xx/5xx avec
      // le `message` du back et son `detail` brut pour les diagnostics).
      let payload: unknown;
      try {
        payload = xhrPayloadOrThrow(xhr);
      } catch (e) {
        reject(e as Error);
        return;
      }
      const parsed = CellReferenceJobAcceptedSchema.safeParse(payload);
      if (!parsed.success) {
        // eslint-disable-next-line no-console
        console.error("[cell-reference upload] schema mismatch", parsed.error.issues, payload);
        reject(
          new ApiSchemaError(
            "Réponse d'upload /settings/cell-ref/upload non conforme au schéma Zod",
            parsed.error.issues,
          ),
        );
        return;
      }
      opts.onJobProgress?.(parsed.data.status, 0);
      waitForCellReferenceJob(parsed.data.job_id, opts).then(resolve, reject);
    };
    xhr.onerror = () => {
      // XHR `onerror` = aucune réponse reçue (DNS, connect refused, CORS
      // bloqué). Seul cas « injoignable » — un 422 passe par `onload`.
      reject(new ApiNetworkError("Backend injoignable"));
    };
    xhr.onabort = () => {
      reject(Object.assign(new Error("Upload annulé"), { code: "ABORTED", status: 0 }));
    };
    opts.signal?.addEventListener("abort", () => xhr.abort());
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}

/** GET /reference/cell/imports */
export async function listCellImports(signal?: AbortSignal): Promise<ReferenceImportEntry[]> {
  return apiOrMock(
    () => apiFetch("/reference/cell/imports", ReferenceImportEntrySchema.array(), { signal }),
    () => referenceMock.imports(),
    "listCellImports",
  );
}

/** GET /reference/cell/summary */
export async function getCellSummary(signal?: AbortSignal): Promise<CellSummary> {
  return apiOrMock(
    () => apiFetch("/reference/cell/summary", CellSummarySchema, { signal }),
    () => referenceMock.summary(),
    "getCellSummary",
  );
}

/**
 * Liste des libellés de Zone ARCEP distincts côté `cell_ref`, extraits du
 * champ `arcep_breakdown` du summary (bc4-back 0.7.1). Les 11 valeurs
 * réelles proviennent de l'API — jamais hardcodées côté UI — et le bucket
 * `"N/D"` (NULL) est inclus **tel quel** quand il est présent.
 * Zod-validé même si l'adaptateur ne retourne qu'un `string[]`.
 */
const ArcepZoneListSchema = z.array(z.string());
export async function getCellArcepZones(signal?: AbortSignal): Promise<string[]> {
  const summary = await getCellSummary(signal);
  const zones = summary.arcep_breakdown.map((b) => b.key);
  return ArcepZoneListSchema.parse(zones);
}
