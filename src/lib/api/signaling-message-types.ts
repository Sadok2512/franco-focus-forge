import { getSignaling } from "./signaling";
import type { SignalingRows } from "./signaling";

type Params = Record<string, string | number | undefined>;
type FetchRows = (
  projectId: string,
  kind: "rows",
  params: Params,
  signal?: AbortSignal,
) => Promise<SignalingRows>;

/** Existing paginated API only. Never expose partial counts as capture totals. */
export async function getAllSignalingRows(
  projectId: string,
  params: Params,
  signal?: AbortSignal,
  fetchRows: FetchRows = getSignaling,
): Promise<SignalingRows> {
  const first = await fetchRows(projectId, "rows", { ...params, page: 1, size: 500 }, signal);
  const batches: SignalingRows[] = [first];
  // Bounded concurrency, respecting the actual page size returned by the VM.
  for (let from = 2; from <= first.pages; from += 3) {
    signal?.throwIfAborted();
    const pages = Array.from({ length: Math.min(3, first.pages - from + 1) }, (_, i) => from + i);
    batches.push(
      ...(await Promise.all(
        pages.map((page) =>
          fetchRows(projectId, "rows", { ...params, page, size: first.size }, signal),
        ),
      )),
    );
  }
  const rows = batches.flatMap((batch) => batch.rows);
  const identities = new Set(rows.map((row) => `${row.capture_id}:${row.seq}`));
  if (
    rows.length !== first.total ||
    identities.size !== rows.length ||
    batches.some((batch) => batch.total !== first.total || batch.capture_id !== first.capture_id)
  ) {
    throw new Error("Incomplete or changing capture message population");
  }
  return { ...first, rows, page: 1, pages: 1, size: rows.length };
}
