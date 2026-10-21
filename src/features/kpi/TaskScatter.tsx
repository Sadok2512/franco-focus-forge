import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { useState, forwardRef, useImperativeHandle } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { getKpiAxes, getTaskPoints } from "@/lib/api/client";
import { toUserMessage } from "@/lib/api/http";
import type { KpiQueryFilters } from "@/lib/api/project-kpi-schemas";
import { downloadCsv } from "./workspace-model";
import { taskPointsCsv } from "./task-series-model";
export const TaskScatter = forwardRef<
  { info: () => void; csv: () => void },
  { projectId: string; code: string; filters: KpiQueryFilters }
>(({ projectId, code, filters }, ref) => {
  useTranslation();
  const [info, setInfo] = useState(false);
  const [selected, setSelected] = useState<string>();
  const axes = useQuery({
    queryKey: ["kpi-axes", projectId],
    queryFn: ({ signal }) => getKpiAxes(projectId, signal),
  });
  const catalog = axes.data ?? [];
  const axis =
    catalog.find((a) => a.code === selected) ??
    catalog.find((a) => a.source.startsWith("measurement_points.")) ??
    catalog[0];
  const points = useQuery({
    queryKey: ["task-points", projectId, code, axis?.code, filters],
    queryFn: ({ signal }) => getTaskPoints(projectId, code, axis!.code, filters, signal),
    enabled: !!axis,
  });
  const data = points.data;
  useImperativeHandle(ref, () => ({
    info: () => setInfo((v) => !v),
    csv: () => {
      if (data) downloadCsv(taskPointsCsv([data]), `${code}-${axis?.code}`);
    },
  }));
  return (
    <section className="p-4 space-y-3" data-testid="task-scatter">
      <div className="flex gap-3 items-center">
        <label>
          {" "}
          {i18n.t("kpi.c3bd9d755359")}{" "}
          <select
            aria-label={i18n.t("kpi.eeb70ec4c2c9")}
            className="kpi-button"
            value={axis?.code ?? ""}
            onChange={(e) => setSelected(e.target.value)}
          >
            {catalog.map((a) => (
              <option key={a.code} value={a.code}>
                {a.label} ({a.unit})
              </option>
            ))}
          </select>
        </label>
        <button
          className="kpi-button"
          disabled={!data?.points.length}
          onClick={() => data && downloadCsv(taskPointsCsv([data]), `${code}-${axis?.code}`)}
        >
          {" "}
          {i18n.t("kpi.4d778fd1b318")}{" "}
        </button>
      </div>
      {(axes.isError || points.isError) && (
        <p role="alert">{toUserMessage(axes.error ?? points.error)}</p>
      )}
      {(axes.isPending || (!!axis && points.isPending)) && (
        <p role="status">{i18n.t("kpi.f8866d4df528")}</p>
      )}
      {info && data && (
        <pre className="text-xs whitespace-pre-wrap">
          {JSON.stringify(
            { result_id: data.result_id, population: data.population, pairing: data.pairing },
            null,
            2,
          )}
        </pre>
      )}
      {data && (
        <>
          <p className="text-xs">
            {data.population.returned} {i18n.t("kpi.b67f8c6de7c1")} {data.population.samples}{" "}
            {i18n.t("kpi.dfa72ca6f201")} {data.population.excluded} {i18n.t("kpi.dcbee7e27134")}{" "}
            {data.population.incomplete_tasks ?? i18n.t("kpi.eb34623b71cd")}
          </p>
          {data.excluded && (
            <p className="text-xs" data-testid="exclusion-reasons">
              {data.excluded.nr_no_profile} {i18n.t("kpi.77fa5b37e051")}{" "}
              {data.excluded.lte_not_enriched} {i18n.t("kpi.15a7bdbe91e5")}{" "}
              {data.excluded.other > 0 && ` · ${data.excluded.other} autres exclusions`}
            </p>
          )}
          {!data.points.length ? (
            <p>{i18n.t("kpi.ef70049b46d8")}</p>
          ) : (
            <div className="h-80" data-testid="task-scatter-chart">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 30, bottom: 30, left: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    dataKey="x"
                    domain={["dataMin", "dataMax"]}
                    name={axis?.label ?? ""}
                    label={{ value: `${axis?.label} (${data.x_unit})`, position: "bottom" }}
                  />
                  <YAxis
                    type="number"
                    dataKey="value"
                    name={code}
                    label={{ value: data.y_unit, angle: -90, position: "insideLeft" }}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      const p = payload?.[0]?.payload;
                      return active && p ? (
                        <div className="bg-background border p-2 text-xs">
                          {axis?.label} : {p.x} {data.x_unit}
                          <br />
                          {p.value} {data.y_unit}
                          <br />
                          capture : {p.capture_id}
                          <br />
                          seq : {p.seq} · radio : {p.mp_seq ?? i18n.t("kpi.eb34623b71cd")}
                          <br />
                          seq_gap : {p.seq_gap ?? i18n.t("kpi.eb34623b71cd")}
                        </div>
                      ) : null;
                    }}
                  />
                  <Scatter data={data.points} fill="#f97316" isAnimationActive={false} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="text-xs"> {i18n.t("kpi.34b17a69e188")} </p>
          <p className="text-[10px]">result_id : {data.result_id}</p>
        </>
      )}
    </section>
  );
});
