// Adaptateur B1-ingest : création de projet + import NMF multi-fichiers.
//
// Règles :
//   - Toute lecture/écriture passe par ce module (la UI ne tape jamais
//     fetch directement).
//   - Chaque réponse est validée par son schéma Zod (`ProjectSchema`,
//     `NmfImportReportSchema`). Une forme non conforme lève — jamais
//     de rendu silencieux.
//   - Upload multipart : on utilise XHR pour exposer la progression
//     (fetch n'expose pas uploadProgress côté navigateur), avec un
//     callback par ÉVÉNEMENT global de l'envoi. Le statut par fichier
//     (`pending → decoding → done | error`) est piloté en local avant
//     l'envoi, puis réconcilié avec le `by_file` renvoyé par le back.
//   - `null` reste `null`. La UI affiche « N/D », jamais 0.
import { z } from "zod";
import {
  ApiHttpError,
  ApiNetworkError,
  ApiSchemaError,
  apiBase,
  apiFetch,
  apiOrMock,
  getSession,
  isApiMode,
  xhrPayloadOrThrow,
} from "./http";
import {
  CreateProjectRequestSchema,
  type CreateProjectRequest,
  ProjectIngestViewSchema,
  type ProjectIngestView,
} from "./project-schemas";
import {
  NmfImportJobSchema,
  type NmfImportJob,
  NmfImportReportSchema,
  type NmfFileStatus,
  type NmfImportReport,
} from "./nmf-schemas";
import type { Project } from "./schemas";
import { FileSummaryResponseSchema, type FileSummaryResponse } from "./file-summary-schemas";
import {
  buildNmfReportMock,
  createProjectMock,
  deleteProjectMock,
  findImportReportMock,
  findProjectMock,
  listProjectsMock,
} from "@/mocks/projects";

/** POST /projects — crée un projet draft, prêt à recevoir des logs NMF.
 *  La réponse est validée strictement par `ProjectIngestViewSchema`
 *  (vue d'ingestion : les résumés `operators / technos / n_captures /
 *  n_events / gps_coverage_pct` peuvent être `null`, la UI respecte le
 *  contrat « null → N/D »). */
export async function createProject(
  input: CreateProjectRequest,
  signal?: AbortSignal,
): Promise<ProjectIngestView> {
  const body = CreateProjectRequestSchema.parse(input);
  return apiOrMock(
    () =>
      apiFetch("/projects", ProjectIngestViewSchema, {
        method: "POST",
        body: JSON.stringify(body),
        signal,
      }),
    async () => {
      await new Promise((r) => setTimeout(r, 120));
      const p = createProjectMock(body.name, body.visibility, {
        parse_decode_level: body.parse_decode_level,
        parse_binning_mode: body.parse_binning_mode,
        parse_temporal_resolution: body.parse_temporal_resolution,
        parse_spatial_bin_m: body.parse_spatial_bin_m,
      });
      // Projection vers la vue "ingestion" : résumés null tant qu'aucun
      // NMF n'a été ingéré (jamais 0, règle dure du lot).
      return ProjectIngestViewSchema.parse({
        id: p.id,
        owner_id: p.owner_id,
        visibility: p.visibility,
        parse_decode_level: body.parse_decode_level,
        parse_binning_mode: body.parse_binning_mode,
        parse_temporal_resolution: body.parse_temporal_resolution,
        parse_spatial_bin_m: body.parse_spatial_bin_m,
        name: p.name,
        created_at: new Date().toISOString(),
        actor: null,
        status: "draft",
        operators: null,
        technos: null,
        n_captures: null,
        n_events: null,
        gps_coverage_pct: null,
      });
    },
    "createProject",
  );
}

/** DELETE /projects/{project_id} — supprime un projet (admin/éditeur).
 *  Le back répond 204 No Content en cas de succès (FK CASCADE côté DB :
 *  nmf_file + stg_event + measurement_points + rrc_observations sont
 *  supprimés avec le projet). 404 si l'id n'existe pas, 403 si le
 *  demandeur est lecteur. L'erreur HTTP est propagée telle quelle à la
 *  UI (via `apiFetch` + `toUserMessage`). */
export async function deleteProject(projectId: string, signal?: AbortSignal): Promise<void> {
  const id = projectId.trim();
  if (!id) {
    throw Object.assign(new Error("Identifiant de projet manquant."), { code: "VALIDATION" });
  }
  return apiOrMock(
    async () => {
      // Pas de corps attendu (204). `apiFetch` tolère un body `null` avec
      // le schéma `z.unknown()` — on jette la valeur et retourne `void`.
      await apiFetch(`/projects/${encodeURIComponent(id)}`, z.unknown(), {
        method: "DELETE",
        signal,
      });
    },
    async () => {
      await new Promise((r) => setTimeout(r, 100));
      // Cohérent avec le back : 404 si inexistant, void sinon. On lève un
      // `ApiHttpError` 404 pour que la UI affiche le même message que
      // l'API réelle (via `toUserMessage`).
      const ok = deleteProjectMock(id);
      if (!ok) {
        throw new ApiHttpError("NOT_FOUND", "Projet introuvable", 404);
      }
    },
    "deleteProject",
  );
}

/** Expose aussi un listing côté mock cohérent avec les créations locales. */
export function listMockProjectsForDemo(): Project[] {
  return listProjectsMock();
}
export function findMockProjectForDemo(id: string): Project | null {
  return findProjectMock(id);
}

/** GET /projects/{id}/import — rapport d'ingestion complet pour un projet.
 *  Appel paresseux (déclenché par l'ouverture de l'accordéon côté UI).
 *  La forme est strictement validée par `NmfImportReportSchema` : si le
 *  back dérive, la UI lève plutôt que d'afficher du vide. */
export async function getImportReport(
  projectId: string,
  signal?: AbortSignal,
): Promise<NmfImportReport> {
  return apiOrMock(
    () =>
      apiFetch(`/projects/${encodeURIComponent(projectId)}/import`, NmfImportReportSchema, {
        signal,
      }),
    async () => {
      await new Promise((r) => setTimeout(r, 120));
      const report = findImportReportMock(projectId);
      if (!report) {
        // Mock : un projet sans ingestion renvoie un rapport vide
        // conforme au schéma (zéro fichier). La UI affiche « N/D »
        // partout — jamais 0 silencieux.
        return NmfImportReportSchema.parse({
          files_received: 0,
          files_done: 0,
          files_error: 0,
          by_file: [],
          n_captures: 0,
          n_events: 0,
          gps_coverage_pct: null,
          operators_seen: {},
          technos_seen: {},
        });
      }
      return NmfImportReportSchema.parse(report);
    },
    "getImportReport",
  );
}

export async function getFileSummary(
  projectId: string,
  offset: number,
  limit: number,
  signal?: AbortSignal,
): Promise<FileSummaryResponse> {
  const params = new URLSearchParams({ offset: String(offset), limit: String(limit) });
  return apiFetch(
    `/projects/${encodeURIComponent(projectId)}/files/summary?${params}`,
    FileSummaryResponseSchema,
    { signal },
  );
}

/* -------------------- Upload NMF -------------------- */

export type NmfPerFileProgress = {
  index: number;
  filename: string;
  size: number;
  status: NmfFileStatus;
  loaded: number;
  percent: number | null;
  error_msg: string | null;
};

export type NmfUploadOptions = {
  signal?: AbortSignal;
  onJobProgress?: (job: NmfImportJob) => void;
  /** Appelé à chaque transition d'un fichier (pending/decoding/done/error)
   *  et à chaque tick de progression. */
  onFileProgress?: (p: NmfPerFileProgress) => void;
};

type MockXhrShim = {
  simulateProgress: (totalBytes: number, onTick: (loaded: number) => void) => Promise<void>;
};

async function _mockNmfUpload(
  files: File[],
  opts: NmfUploadOptions,
  shim?: MockXhrShim,
): Promise<NmfImportReport> {
  const totalBytes = files.reduce((s, f) => s + f.size, 0);
  // Simule un XHR progress en mode mock pour que la UI exerce la même
  // branche d'affichage que l'API réelle.
  if (opts.onFileProgress) {
    files.forEach((f, i) =>
      opts.onFileProgress!({
        index: i,
        filename: f.name,
        size: f.size,
        status: "pending",
        loaded: 0,
        percent: 0,
        error_msg: null,
      }),
    );
  }
  if (shim) {
    await shim.simulateProgress(totalBytes, (loaded) => {
      if (!opts.onFileProgress) return;
      // Répartit les octets envoyés par fichier dans l'ordre.
      let remaining = loaded;
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        if (!f) continue;
        const take = Math.min(remaining, f.size);
        const pct = f.size > 0 ? Math.round((take / f.size) * 100) : 100;
        opts.onFileProgress({
          index: i,
          filename: f.name,
          size: f.size,
          status: take === f.size ? "decoding" : "pending",
          loaded: take,
          percent: pct,
          error_msg: null,
        });
        remaining -= take;
        if (remaining <= 0) break;
      }
    });
  }
  const report = buildNmfReportMock(files.map((f) => f.name));
  // Réconciliation finale par fichier.
  if (opts.onFileProgress) {
    report.by_file.forEach((f, i) =>
      opts.onFileProgress!({
        index: i,
        filename: f.filename,
        size: files[i]?.size ?? 0,
        status: f.status,
        loaded: files[i]?.size ?? 0,
        percent: 100,
        error_msg: f.error_msg,
      }),
    );
  }
  return report;
}

/** POST /projects/{id}/nmf — multipart multi-fichiers.
 *  Les octets sont streamés via XHR pour exposer la progression ; la
 *  réponse JSON est validée strictement par `NmfImportReportSchema`. */
export async function uploadNmfFiles(
  projectId: string,
  files: File[],
  opts: NmfUploadOptions = {},
): Promise<NmfImportReport> {
  if (!files.length) {
    throw Object.assign(new Error("Aucun fichier NMF sélectionné."), { code: "VALIDATION" });
  }

  if (!isApiMode()) {
    return _mockNmfUpload(files, opts, {
      simulateProgress: async (totalBytes, onTick) => {
        // 8 ticks ~ 400ms pour simuler le streaming de l'upload.
        const steps = 8;
        for (let s = 1; s <= steps; s++) {
          await new Promise((r) => setTimeout(r, 50));
          onTick(Math.floor((totalBytes * s) / steps));
        }
      },
    });
  }

  return new Promise<NmfImportReport>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const path = `/projects/${encodeURIComponent(projectId)}/nmf`;
    xhr.open("POST", `${apiBase()}${path}`, true);
    const s = getSession();
    if (s) {
      xhr.setRequestHeader("Authorization", `Bearer ${s.token}`);
    }

    // Marque tous les fichiers en pending au démarrage.
    if (opts.onFileProgress) {
      files.forEach((f, i) =>
        opts.onFileProgress!({
          index: i,
          filename: f.name,
          size: f.size,
          status: "pending",
          loaded: 0,
          percent: 0,
          error_msg: null,
        }),
      );
    }

    const totalBytes = files.reduce((acc, f) => acc + f.size, 0);
    xhr.upload.onprogress = (ev) => {
      if (!opts.onFileProgress) return;
      const loaded = ev.loaded;
      let remaining = loaded;
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        if (!f) continue;
        const take = Math.min(remaining, f.size);
        const pct = f.size > 0 ? Math.round((take / f.size) * 100) : 100;
        opts.onFileProgress({
          index: i,
          filename: f.name,
          size: f.size,
          status: take >= f.size ? "decoding" : "pending",
          loaded: take,
          percent: pct,
          error_msg: null,
        });
        remaining -= take;
        if (remaining <= 0) break;
      }
      // Si total connu et dépassé, s'assure que le dernier fichier passe en decoding.
      if (ev.lengthComputable && loaded >= totalBytes && files.length) {
        files.forEach((f, i) =>
          opts.onFileProgress!({
            index: i,
            filename: f.name,
            size: f.size,
            status: "decoding",
            loaded: f.size,
            percent: 100,
            error_msg: null,
          }),
        );
      }
    };

    xhr.onload = async () => {
      // Convertit la réponse XHR en payload JSON OU en erreur typée
      // (ApiUnauthenticatedError sur 401 — purge+évènement émis par
      // le helper ; ApiHttpError sur 4xx/5xx avec le `message` du back
      // et son `detail` brut pour `missing_columns`/`by_file` etc.).
      let payload: unknown;
      try {
        payload = xhrPayloadOrThrow(xhr);
      } catch (e) {
        reject(e as Error);
        return;
      }
      // 202 acknowledges durable storage; decoding runs in a separate worker.
      if (xhr.status === 202) {
        try {
          payload = await waitForNmfJob(projectId, payload, files, opts);
        } catch (error) {
          reject(error);
          return;
        }
      }
      const parsed = NmfImportReportSchema.safeParse(payload);
      if (!parsed.success) {
        reject(
          new ApiSchemaError(
            "Rapport d'import NMF non conforme au schéma Zod",
            parsed.error.issues,
          ),
        );
        return;
      }
      // Réconciliation finale : la UI reçoit le statut REEL de chaque
      // fichier côté serveur, y compris les erreurs (error_msg non null).
      if (opts.onFileProgress) {
        parsed.data.by_file.forEach((f, i) =>
          opts.onFileProgress!({
            index: i,
            filename: f.filename,
            size: files[i]?.size ?? 0,
            status: f.status,
            loaded: files[i]?.size ?? 0,
            percent: 100,
            error_msg: f.error_msg,
          }),
        );
      }
      resolve(parsed.data);
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
    files.forEach((f) => form.append("files", f, f.name));
    xhr.send(form);
  });
}

export async function waitForNmfJob(
  projectId: string,
  initial: unknown,
  files: File[],
  opts: NmfUploadOptions,
): Promise<NmfImportReport> {
  let job = NmfImportJobSchema.parse(initial);
  while (true) {
    opts.onJobProgress?.(job);
    job.by_file.forEach((entry, index) =>
      opts.onFileProgress?.({
        index,
        filename: entry.filename,
        size: files[index]?.size ?? 0,
        status: entry.status,
        loaded: files[index]?.size ?? 0,
        percent: 100,
        error_msg: entry.error_msg,
      }),
    );
    if (job.status === "done" || job.status === "error") {
      if (job.report) return job.report;
      throw new ApiHttpError(
        "IMPORT_FAILED",
        job.error_msg ?? "Échec du traitement de l’import",
        422,
      );
    }
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer);
        reject(new Error("Suivi interrompu ; l’import continue sur le serveur."));
      };
      const timer = setTimeout(() => {
        opts.signal?.removeEventListener("abort", abort);
        resolve();
      }, 2000);
      if (opts.signal?.aborted) abort();
      else opts.signal?.addEventListener("abort", abort, { once: true });
    });
    job = await apiFetch(
      `/projects/${encodeURIComponent(projectId)}/imports/${encodeURIComponent(job.id)}`,
      NmfImportJobSchema,
      { signal: opts.signal },
    );
  }
}
