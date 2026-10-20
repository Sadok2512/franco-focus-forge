import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { getProjectTasks, getTaskSeries } from "@/lib/api/client";
import { getSession, toUserMessage } from "@/lib/api/http";
import type { KpiQueryFilters } from "@/lib/api/project-kpi-schemas";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { downloadCsv } from "./workspace-model";
import { TASK_COLORS, POINT_COLUMNS, taskPointsCsv } from "./task-series-model";

export type TaskAnalyticsHandle = { info: () => void; csv: () => void };
export const TaskAnalytics = forwardRef<
  TaskAnalyticsHandle,
  {
    projectId: string;
    code: string;
    unit: string;
    filters: KpiQueryFilters;
    taskId: string | undefined;
    setTaskId: (id: string | undefined) => void;
    onCaptureChange: (capture: string) => void;
  }
>(({ projectId, code, unit, filters, taskId, setTaskId, onCaptureChange }, ref) => {
  const [info, setInfo] = useState(false);
  const tasks = useQuery({
    queryKey: ["tasks", projectId, filters],
    queryFn: ({ signal }) => getProjectTasks(projectId, filters, signal),
  });
  useEffect(() => {
    const first = tasks.data?.tasks[0]?.capture_id;
    if (!filters.capture_id && first) onCaptureChange(first);
  }, [filters.capture_id, tasks.data, onCaptureChange]);
  const selected = tasks.data?.tasks.find((t) => t.id === taskId && t.status === "ok");
  const operators = [...new Set(tasks.data?.tasks.map((t) => t.operator) ?? [])];
  const groups = selected
    ? [{ label: selected.operator ?? "N/D", filters, id: selected.id }]
    : ["operator", "operator_band"].includes(filters.group_by ?? "none") &&
        operators.length &&
        operators.every((op) => op !== null)
      ? operators.map((op) => ({
          label: op!,
          filters: { ...filters, operator: [op!] },
          id: undefined,
        }))
      : [{ label: "Population filtrée", filters, id: undefined }];
  const queries = useQueries({
    queries: groups.map((group) => ({
      queryKey: ["task-series", projectId, code, group.filters, group.id],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        getTaskSeries(projectId, code, group.filters, group.id, signal),
      enabled: tasks.isSuccess && !!filters.capture_id,
    })),
  });
  const results = queries.flatMap((q) => (q.data ? [q.data] : []));
  const csv = () => {
    if (results.length) downloadCsv(taskPointsCsv(results), `${code}-task-time`);
  };
  useImperativeHandle(ref, () => ({ info: () => setInfo(true), csv }));
  const taskLabel = selected
    ? `${selected.task_type} · ${selected.capture_id} · ${selected.id}`
    : "Enveloppe P10 / P50 / P90";
  return (
    <section className="p-4 space-y-3" data-testid="task-analytics">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-medium">Tâche</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="kpi-button max-w-full truncate" aria-label="Choisir une tâche">
              {taskLabel}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="max-h-80 overflow-y-auto max-w-[90vw]">
            <DropdownMenuItem onSelect={() => setTaskId(undefined)}>
              Enveloppe P10 / P50 / P90
            </DropdownMenuItem>
            {tasks.data?.tasks.map((task) => (
              <span
                key={task.id}
                className="block"
                title={task.status === "ok" ? task.id : (task.reason ?? `Statut : ${task.status}`)}
              >
                <DropdownMenuItem
                  disabled={task.status !== "ok"}
                  onSelect={() => setTaskId(task.id)}
                  data-task-id={task.id}
                >
                  {task.task_type} · {task.operator ?? "N/D"} · {task.capture_id} · {task.id}{" "}
                  {task.status !== "ok" && `· ${task.status}`}
                </DropdownMenuItem>
              </span>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <button className="kpi-button" onClick={() => setInfo(true)}>
          Infos Task Time
        </button>
        <span
          title={!results.length ? "Points non disponibles" : "Exporter les points reçus de l’API"}
        >
          <button className="kpi-button" disabled={!results.length} onClick={csv}>
            CSV des points
          </button>
        </span>
      </div>
      {tasks.isPending && <p role="status">Chargement des tâches…</p>}
      {tasks.isError && <p role="alert">{toUserMessage(tasks.error)}</p>}
      {tasks.data && (
        <p className="text-xs text-muted-foreground">
          Population des tâches : {tasks.data.population.tasks} · incomplètes :{" "}
          {tasks.data.population.incomplete_tasks ?? "N/D"}
        </p>
      )}
      {queries.map((q, index) => {
        const result = q.data,
          label = groups[index]!.label,
          color = TASK_COLORS[label] ?? TASK_COLORS["N/D"];
        if (q.isError)
          return (
            <p key={label} role="alert">
              {label} : {toUserMessage(q.error)}
            </p>
          );
        if (!result)
          return (
            <p key={label} role="status">
              Chargement de la série…
            </p>
          );
        if (result.x_unit !== "s" || result.y_unit !== unit)
          return (
            <p key={label} role="alert">
              Contrat back incompatible : unités reçues {result.x_unit} / {result.y_unit}, attendues
              s / {unit}.
            </p>
          );
        return (
          <div key={label} data-testid="task-series-result" data-result-id={result.result_id}>
            <p className="text-xs">
              <strong style={{ color }}>{label}</strong> · population : {result.population.tasks}{" "}
              tâches, {result.population.samples} mesures · retournés : {result.population.returned}{" "}
              · exclus : {result.population.excluded}
            </p>
            {!result.points.length ? (
              <p role="status">Aucun point renvoyé par l’API pour cette population.</p>
            ) : (
              <div className="h-72 w-full" data-testid="task-series-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={result.points}
                    margin={{ top: 25, right: 25, left: 10, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      dataKey="t_rel_s"
                      domain={[0, "dataMax"]}
                      label={{ value: "Task Time (s)", position: "insideBottom", offset: -12 }}
                    />
                    <YAxis
                      width={100}
                      domain={[0, "dataMax"]}
                      label={{ value: unit, angle: -90, position: "insideLeft" }}
                    />
                    <Tooltip />
                    <Legend verticalAlign="top" />
                    {(selected ? (["value"] as const) : (["p10", "p50", "p90"] as const)).map(
                      (key) => (
                        <Line
                          key={key}
                          type="linear"
                          dataKey={key}
                          name={
                            key === "value"
                              ? `${label} · ${code}`
                              : `${label} · ${key.toUpperCase()}`
                          }
                          stroke={color}
                          strokeWidth={key === "p50" || key === "value" ? 2 : 1}
                          strokeDasharray={
                            key === "p10" ? "3 3" : key === "p90" ? "8 3" : undefined
                          }
                          dot={false}
                          connectNulls={false}
                          isAnimationActive={false}
                        />
                      ),
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            <p className="text-[10px] text-muted-foreground">
              {selected
                ? "Courbe de la tâche sélectionnée."
                : "P10/P50/P90 fournis par l’API, alignement Task Time exact."}{" "}
              result_id : {result.result_id}
            </p>
            <div
              className="max-h-52 overflow-auto border rounded mt-2"
              data-testid="task-points-table"
            >
              <table className="w-full text-xs">
                <caption className="text-left p-2">
                  Points reçus · {unit} · Task Time en secondes
                </caption>
                <thead>
                  <tr>
                    {POINT_COLUMNS.map((k) => (
                      <th className="p-2 text-left" key={k}>
                        {k}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.points.map((point, i) => (
                    <tr key={i}>
                      {POINT_COLUMNS.map((k) => (
                        <td key={k} className="p-2 whitespace-nowrap">
                          {point[k] ?? "N/D"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
      <Sheet open={info} onOpenChange={setInfo}>
        <SheetContent className="overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Infos Task Time — {code}</SheetTitle>
            <SheetDescription>Résultats et populations renvoyés par l’API.</SheetDescription>
          </SheetHeader>
          {results.map((result) => (
            <dl key={result.result_id} className="kpi-info-list break-all">
              {Object.entries({
                result_id: result.result_id,
                population: result.population,
                "Unité X": result.x_unit,
                "Unité Y": result.y_unit,
                sampling: result.sampling,
                pairing: result.pairing,
              }).map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>
                    {value == null
                      ? "N/D"
                      : typeof value === "object"
                        ? JSON.stringify(value)
                        : value}
                  </dd>
                </div>
              ))}
              <div>
                <dt>Preuve administrateur</dt>
                <dd>
                  {getSession()?.user.role === "admin" ? (
                    <a
                      className="underline"
                      href={`/results/${encodeURIComponent(result.result_id)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      /results/{result.result_id}
                    </a>
                  ) : (
                    <span
                      aria-disabled="true"
                      className="text-muted-foreground"
                      title="Accès administrateur requis"
                    >
                      /results/{result.result_id}
                    </span>
                  )}
                </dd>
              </div>
            </dl>
          ))}
          {!results.length && <p>Aucun résultat disponible.</p>}
        </SheetContent>
      </Sheet>
    </section>
  );
});
TaskAnalytics.displayName = "TaskAnalytics";
