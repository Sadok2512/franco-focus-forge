import { formatNumber } from "@/lib/i18n";
import { ChartSpinner } from "./ChartSpinner";
import { useTranslation } from "react-i18next";
import type { CurveType } from "./visualization-model";
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Brush,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getKpiCaptures, getKpiTimeSeries } from "@/lib/api/kpi-timeseries";
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
  curveType = "line",
}: {
  projectId: string;
  captureId: string | undefined;
  onCaptureChange: (capture: string) => void;
  code: string;
  unit: string | null;
  maxPoints?: number;
  height?: number;
  curveType?: CurveType;
}) {
  const { t: translate } = useTranslation();
  // 1.45.1 — Auto-sélection : si aucune capture n'est encore active au
  // niveau du workspace (cas user qui ouvre Graphique sans passer par
  // Chronogramme), on appelle `/projects/{p}/kpi/{code}/captures`
  // (back 0.60.2) qui liste les captures ayant au moins 1 observation
  // de ce KPI. On trie par n_observations décroissant pour afficher la
  // capture la plus riche en premier.
  const captures = useQuery({
    queryKey: ["kpi-captures", projectId, code],
    queryFn: ({ signal }) => getKpiCaptures(projectId, code, signal),
    enabled: !captureId,
  });
  useEffect(() => {
    const sorted = [...(captures.data ?? [])].sort((a, b) => b.n_observations - a.n_observations);
    const first = sorted[0]?.capture_id;
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
          <strong>{translate("metrics.d854ce90120a")}</strong>
          <p>{toUserMessage(captures.error)}</p>
        </div>
      );
    }
    if (!captures.isPending && captures.data && captures.data.length === 0) {
      return (
        <div className="kpi-chart-state" role="status">
          <strong>{translate("metrics.3fd2fa69202a")}</strong>
          <p> {translate("metrics.ce1d87439ed3")} </p>
        </div>
      );
    }
    return (
      <ChartSpinner label={translate("metrics.de3b78444032")} />
    );
  }

  if (query.isPending) {
    return (
      <ChartSpinner label={translate("metrics.705a2156c1b4")} />
    );
  }
  if (query.isError) {
    return (
      <div className="kpi-chart-state" role="alert">
        <strong>{translate("metrics.f1d7675032b2")}</strong>
        <p>{toUserMessage(query.error)}</p>
      </div>
    );
  }
  if (!data) return null;

  if (data.status !== "AVAILABLE") {
    return (
      <div className="kpi-chart-state" role="status">
        <strong>{data.status}</strong>
        <p>{data.reason ?? translate("metrics.03cba548e162")}</p>
      </div>
    );
  }
  if (!points.length) {
    return (
      <div className="kpi-chart-state" role="status">
        {" "}
        {translate("metrics.cb634d687df7")}{" "}
      </div>
    );
  }

  const xUnit = data.x_axis.unit ?? "s";
  const yUnit = data.y_axis.unit ?? unit ?? "";

  // 1.43.0 — Marges resserrées : haut 10 px, droite 14 px, bas réservé
  // uniquement à l'axe X + Brush, gauche calculée via l'axe Y
  // (graduations + unité). Pas de titre dupliqué sur la zone de tracé —
  // le nom du KPI vit uniquement dans l'en-tête de la carte. Pas de
  // légende sur une série unique (règle du mandat §5).
  return (
    <div
      className="w-full h-full"
      style={{ height: height === 430 ? height : "var(--kpi-panel-chart-height, 235px)" }}
      data-testid="metric-vs-time-chart"
      data-result-id={data.evidence.result_id ?? ""}
      data-n-total={data.n_total}
      data-n-returned={data.n_returned}
      data-source-view={data.evidence.source_view ?? ""}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 10, right: 14, left: 4, bottom: 24 }}>
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
          <XAxis
            type="number"
            dataKey="time_s"
            domain={[0, "dataMax"]}
            tickCount={6}
            tick={{ fontSize: 10, fill: "#64748b" }}
            tickFormatter={(v: number) =>
              typeof v === "number"
                ? formatNumber(v, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " s"
                : String(v)
            }
          />
          <YAxis
            width={54}
            domain={["auto", "auto"]}
            tick={{ fontSize: 10, fill: "#64748b" }}
            tickFormatter={(v: number) =>
              typeof v === "number"
                ? yUnit === "%"
                  ? formatNumber(v, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " %"
                  : formatNumber(v, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                : String(v)
            }
          />
          <Tooltip
            cursor={{ stroke: "#94a3b8", strokeDasharray: "2 2" }}
            contentStyle={{ fontSize: 11, padding: "4px 8px" }}
            formatter={(value: number) => [
              `${value}${yUnit ? " " + yUnit : ""}`,
              data.metric_name ?? data.metric_code,
            ]}
            labelFormatter={(label: number) =>
              typeof label === "number"
                ? `${formatNumber(label, { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ${xUnit}`
                : String(label)
            }
          />
          <Line
            type="linear"
            dataKey="value"
            stroke="#1d4ed8"
            strokeWidth={curveType === "points" ? 0 : 1.2}
            dot={curveType === "line" ? false : { r: 2, fill: "#1d4ed8", strokeWidth: 0 }}
            connectNulls={false}
            isAnimationActive={false}
          />
          {points.length > 50 ? (
            <Brush
              dataKey="time_s"
              height={16}
              travellerWidth={7}
              stroke="#94a3b8"
              fill="#f1f5f9"
            />
          ) : null}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
