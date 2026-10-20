import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Brush,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getKpiTimeSeries } from "@/lib/api/kpi-timeseries";
import { getMetricCaptures } from "@/lib/api/metrics";
import { toUserMessage } from "@/lib/api/http";

/** Vue Graphique — mode « Metric vs Time ».
 *
 *  Lit `(seq, time_s, value)` depuis
 *  `/projects/{pid}/captures/{cid}/kpi/{code}/time-series` et affiche
 *  une courbe simple. **Aucun contrôle UI ajouté** : si aucune capture
 *  n'est encore sélectionnée dans le workspace, le composant pré-charge
 *  la liste `/metrics/captures` et appelle `onCaptureChange` sur la
 *  première capture retournée. Axes imposés par le contrat
 *  (X = capture time secondes, Y = unité catalogue), tooltip + zoom
 *  Brush fournis par recharts.
 *
 *  Statuts non `AVAILABLE` : message explicite (jamais de bascule
 *  silencieuse vers un agrégat — règle du mandat #7). */
export function MetricVsTimeChart({
  projectId,
  captureId,
  onCaptureChange,
  code,
  unit,
  maxPoints = 5000,
  height = 235,
}: {
  projectId: string;
  captureId: string | undefined;
  onCaptureChange: (capture: string) => void;
  code: string;
  unit: string | null;
  maxPoints?: number;
  height?: number;
}) {
  // Auto-sélection : si aucune capture n'est encore active au niveau
  // du workspace (cas user qui ouvre Graphique sans passer par
  // Chronogramme), on remonte la première capture connue du projet.
  const captures = useQuery({
    queryKey: ["metric-captures", projectId],
    queryFn: ({ signal }) => getMetricCaptures(projectId, {}, signal),
    enabled: !captureId,
  });
  useEffect(() => {
    const first = captures.data?.[0]?.capture_id;
    if (!captureId && first) onCaptureChange(first);
  }, [captureId, captures.data, onCaptureChange]);

  const query = useQuery({
    queryKey: ["kpi-timeseries", projectId, captureId, code, maxPoints],
    queryFn: ({ signal }) =>
      getKpiTimeSeries(projectId, captureId as string, code, maxPoints, signal),
    enabled: !!captureId,
  });

  const data = query.data;
  const points = useMemo(
    () =>
      (data?.points ?? [])
        .filter((p) => typeof p.value === "number")
        .map((p) => ({ seq: p.seq, time_s: p.time_s, value: p.value as number })),
    [data],
  );

  if (!captureId) {
    if (captures.isError) {
      return (
        <div className="kpi-chart-state" role="alert">
          <strong>Capture indisponible</strong>
          <p>{toUserMessage(captures.error)}</p>
        </div>
      );
    }
    if (!captures.isPending && captures.data && captures.data.length === 0) {
      return (
        <div className="kpi-chart-state" role="status">
          <strong>Aucune capture disponible</strong>
          <p>Ce projet ne contient pas de capture avec mesures Nemo décodées.</p>
        </div>
      );
    }
    return (
      <div className="kpi-chart-state animate-pulse" role="status">
        Sélection automatique d’une capture…
      </div>
    );
  }

  if (query.isPending) {
    return (
      <div className="kpi-chart-state animate-pulse" role="status">
        Chargement de la métrique…
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="kpi-chart-state" role="alert">
        <strong>Données indisponibles</strong>
        <p>{toUserMessage(query.error)}</p>
      </div>
    );
  }
  if (!data) return null;

  if (data.status !== "AVAILABLE") {
    return (
      <div className="kpi-chart-state" role="status">
        <strong>{data.status}</strong>
        <p>{data.reason ?? "Aucune série temporelle validée pour cette métrique."}</p>
      </div>
    );
  }
  if (!points.length) {
    return (
      <div className="kpi-chart-state" role="status">
        Aucun point retourné par l’API pour cette capture.
      </div>
    );
  }

  const xUnit = data.x_axis.unit ?? "s";
  const yUnit = data.y_axis.unit ?? unit ?? "";
  const samplingLabel =
    data.sampling && data.sampling.method !== "none"
      ? ` · sous-échantillonné ${data.sampling.method} (${data.n_returned}/${data.n_total})`
      : ` · ${data.n_total} points`;

  return (
    <div
      className="w-full"
      style={{ height }}
      data-testid="metric-vs-time-chart"
      data-result-id={data.evidence.result_id ?? ""}
      data-n-total={data.n_total}
      data-n-returned={data.n_returned}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 15, right: 25, left: 10, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            type="number"
            dataKey="time_s"
            domain={[0, "dataMax"]}
            tickFormatter={(v: number) => (typeof v === "number" ? v.toFixed(1) : String(v))}
            label={{
              value: `Temps capture (${xUnit})`,
              position: "insideBottom",
              offset: -12,
            }}
          />
          <YAxis
            width={70}
            domain={["auto", "auto"]}
            label={{ value: yUnit, angle: -90, position: "insideLeft" }}
          />
          <Tooltip
            formatter={(value: number) => [
              `${value} ${yUnit}`,
              data.metric_name ?? data.metric_code,
            ]}
            labelFormatter={(label: number) => `${label} ${xUnit}`}
          />
          <Legend verticalAlign="top" />
          <Line
            type="linear"
            dataKey="value"
            name={`${data.metric_name ?? data.metric_code}${samplingLabel}`}
            stroke="#1d4ed8"
            strokeWidth={1.5}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
          {points.length > 50 ? (
            <Brush dataKey="time_s" height={18} travellerWidth={8} stroke="#64748b" />
          ) : null}
        </LineChart>
      </ResponsiveContainer>
      <p className="text-[10px] text-muted-foreground mt-1">
        Capture {data.capture_id} · {data.n_total} points bruts · {data.n_returned} affichés ·
        source {data.evidence.source_view ?? "n/a"} · result_id {data.evidence.result_id ?? "n/a"}
      </p>
    </div>
  );
}
