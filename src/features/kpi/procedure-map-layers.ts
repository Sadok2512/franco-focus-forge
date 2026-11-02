export type IncidentLayerKey = "drops" | "rlf" | "ho_failures" | "scg_failures";

export const FAILURE_RESULTS = ["FAILURE", "ABNORMAL_RELEASE", "DROP", "TIMEOUT"];

export function procedureIncidentLayer(row: {
  procedure_type: string;
  result: string;
}): IncidentLayerKey | null {
  if (row.result === "DROP" || row.result === "ABNORMAL_RELEASE") return "drops";
  if (row.procedure_type === "lte_rlf_probable" || row.procedure_type === "nr_rlf_probable")
    return "rlf";
  if (row.procedure_type.startsWith("lte_ho_") && FAILURE_RESULTS.includes(row.result))
    return "ho_failures";
  if (row.procedure_type === "endc_scg_failure" && FAILURE_RESULTS.includes(row.result))
    return "scg_failures";
  return null;
}
