import type { FileSummaryCell } from "@/lib/api/file-summary-schemas";

export type FileSummarySortDirection = "asc" | "desc";

export const FAILURE_SUMMARY_COLUMNS = new Set([
  "rach_fail",
  "call_setup_fail",
  "voice_drop",
  "session_fail",
]);

export function isPositiveFailure(code: string, cell: FileSummaryCell | undefined): boolean {
  return FAILURE_SUMMARY_COLUMNS.has(code) && typeof cell?.value === "number" && cell.value > 0;
}

export function compareFileSummaryValues(
  left: string | number | null | undefined,
  right: string | number | null | undefined,
  direction: FileSummarySortDirection,
): number {
  const leftMissing = left == null || left === "";
  const rightMissing = right == null || right === "";
  if (leftMissing || rightMissing) {
    if (leftMissing && rightMissing) return 0;
    return leftMissing ? 1 : -1;
  }
  const result =
    typeof left === "number" && typeof right === "number"
      ? left - right
      : String(left).localeCompare(String(right), undefined, {
          numeric: true,
          sensitivity: "base",
        });
  return direction === "asc" ? result : -result;
}
