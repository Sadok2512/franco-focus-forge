import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDecodeStatus, startDeepDecode } from "@/lib/api/client";
import { getSession, toUserMessage } from "@/lib/api/http";
export function DecodePanel({
  projectId,
  captureId,
}: {
  projectId: string;
  captureId?: string | undefined;
}) {
  const client = useQueryClient();
  const state = useQuery({
    queryKey: ["decode-status", projectId],
    queryFn: ({ signal }) => getDecodeStatus(projectId, signal),
    refetchInterval: (q) =>
      q.state.data?.jobs.some((j) => ["queued", "running"].includes(j.status)) ? 5000 : false,
    staleTime: 5000,
  });
  const mutation = useMutation({
    mutationFn: () => startDeepDecode(projectId, captureId),
    onSuccess: () => client.invalidateQueries({ queryKey: ["decode-status", projectId] }),
  });
  const active = state.data?.jobs.find((j) => ["queued", "running"].includes(j.status));
  const wasActive = useRef(false);
  useEffect(() => {
    if (wasActive.current && !active && state.data) {
      for (const key of ["metrics", "metric-series", "metric-captures", "unknown-metrics"])
        void client.invalidateQueries({ queryKey: [key, projectId] });
    }
    wasActive.current = !!active;
  }, [active, state.data, projectId, client]);
  const cap = state.data?.captures.find((c) => c.capture_id === captureId);
  const remaining = captureId
    ? cap?.estimated_deep_minutes
    : state.data?.estimated_remaining_minutes;
  const latest = state.data?.jobs.find((j) => !captureId || j.capture_ids.includes(captureId));
  const job =
    active ??
    (mutation.data
      ? (state.data?.jobs.find((j) => j.id === mutation.data.id) ?? mutation.data)
      : undefined);
  return (
    <div
      className="rounded-md border border-border bg-muted/20 px-3 py-2 text-xs space-y-2"
      data-testid={captureId ? "capture-decode" : "project-decode"}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground">{captureId ? "Capture" : "Projet"}</span>
        {captureId ? (
          cap ? (
            <span className="rounded border border-primary/40 bg-primary/10 px-2 py-1 font-medium">
              {cap.decode_level === "deep" ? "Deep" : "Light"} {cap.decoder_version}
            </span>
          ) : (
            <span>N/D — décodage non disponible</span>
          )
        ) : (
          state.data?.levels.map((l) => (
            <span
              key={`${l.level}-${l.decoder_version}`}
              className="rounded border border-primary/40 bg-primary/10 px-2 py-1 font-medium"
            >
              {l.level === "deep" ? "Deep" : "Light"} {l.decoder_version} · {l.captures} captures
            </span>
          ))
        )}
        {!!state.data?.undecoded && !captureId && <span>{state.data.undecoded} non décodées</span>}
        {getSession()?.user.role === "admin" && (
          <button
            className="kpi-button disabled:opacity-50"
            disabled={
              !state.data ||
              !!active ||
              mutation.isPending ||
              remaining === 0 ||
              (captureId !== undefined && !cap)
            }
            onClick={() => mutation.mutate()}
          >
            Analyse approfondie
          </button>
        )}
        {remaining !== undefined && remaining > 0 && !active && (
          <span title={state.data?.estimate_basis}>Estimation : {remaining} min</span>
        )}
      </div>
      {job && (
        <div role="status" className="space-y-1">
          <p>
            {job.status === "queued"
              ? "En attente"
              : job.status === "running"
                ? "Analyse en cours"
                : job.status === "done"
                  ? "Analyse terminée"
                  : "Analyse interrompue"}{" "}
            · {job.done} / {job.total} captures · {job.progress_percent} %
          </p>
          <progress
            className="w-full h-2 accent-primary"
            value={job.progress_percent}
            max={100}
            aria-label="Progression du décodage"
          />
          {["queued", "running"].includes(job.status) && (
            <p title={state.data?.estimate_basis}>
              Temps restant estimé : {job.estimated_remaining_minutes} min ·{" "}
              {job.captures_remaining} captures restantes
            </p>
          )}
        </div>
      )}
      {latest?.status === "error" && (
        <p role="alert">Dernière analyse interrompue : {latest.error}. Relance disponible.</p>
      )}
      {(state.error || mutation.error) && (
        <p role="alert">{toUserMessage(state.error ?? mutation.error)}</p>
      )}
    </div>
  );
}
