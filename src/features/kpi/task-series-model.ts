import type { Analytics } from "@/lib/api/task-analytics";
export const TASK_COLORS: Record<string, string> = {
  Orange: "#FF7900",
  Bouygues: "#009DE0",
  SFR: "#E2001A",
  Free: "#A0148C",
  "N/D": "#9AA0A6",
};
export const POINT_COLUMNS = [
  "task_id",
  "capture_id",
  "seq",
  "mp_seq",
  "seq_gap",
  "t_rel_s",
  "x",
  "value",
  "p10",
  "p50",
  "p90",
  "n",
] as const;
export function taskPointsCsv(results: Analytics[]) {
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [
    ["result_id", ...POINT_COLUMNS].join(","),
    ...results.flatMap((r) =>
      r.points.map((p) => [r.result_id, ...POINT_COLUMNS.map((k) => p[k])].map(cell).join(",")),
    ),
  ].join("\r\n");
}
