// Pure Superstream rules (no I/O) so they can be unit-tested.
export type SuperstreamLog = {
  id: string;
  filename: string;
  status?: string; // NMFHE2 — 'done' | 'decoding' | 'pending' | 'error'
  n_captures: number | null;
  n_events: number | null; // L3 messages décodés (RRCSM/SIPSM/L3SM)
  n_gps: number | null; // COUNT(event_code='GPS')
  n_records: number | null; // NMFHE2 — records bruts (nmf_capture.n_records)
  imported_at: string | null; // NMFHE2 — nmf_file.uploaded_at
  capture_ids: string[];
};

export type SuperstreamCapture = {
  id: string;
  captureId: string;
  filename: string;
  label: string;
  status?: string | undefined;
  n_events: number | null;
  n_gps: number | null;
  n_records: number | null;
  imported_at: string | null;
};

/** Un log est sélectionnable comme membre d'un superstream ssi son
 *  import est terminé (`status === 'done'`). Les autres statuts
 *  (decoding/pending/error) sont grisés avec tooltip. */
export function isLogSelectable(log: SuperstreamLog): boolean {
  return log.status === "done" || log.status === undefined;
  // `undefined` conservé pour compat anciens projets dont l'import_report
  // ne pose pas encore `status` ; le back actuel l'alimente toujours.
}

export function isCaptureSelectable(capture: SuperstreamCapture): boolean {
  return capture.status === "done" || capture.status === undefined;
}

export type NameError = "required" | "invalid" | "duplicate" | null;

const NAME_RE = /^[\p{L}\p{N} ._-]+$/u;

export function normalizeName(name: string): string {
  return name.trim();
}

/** Non-empty, allowed characters, unique per project (case-insensitive). */
export function validateName(name: string, existing: string[], selfName?: string): NameError {
  const n = normalizeName(name);
  if (!n) return "required";
  if (!NAME_RE.test(n)) return "invalid";
  const lower = n.toLowerCase();
  const self = selfName?.trim().toLowerCase();
  if (existing.some((e) => e.trim().toLowerCase() === lower && e.trim().toLowerCase() !== self)) {
    return "duplicate";
  }
  return null;
}

export type PasteResult = { ids: string[]; unknown: string[]; ambiguous: string[] };

/** Split comma-separated filenames, trim, drop empties, dedupe, resolve to log ids
 *  of the CURRENT project only. Unknown and ambiguous names are reported, never guessed. */
export function parsePastedFilenames(text: string, logs: SuperstreamLog[]): PasteResult {
  const names = [
    ...new Set(
      text
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
  const ids: string[] = [];
  const unknown: string[] = [];
  const ambiguous: string[] = [];
  for (const name of names) {
    const matches = logs.filter((l) => l.filename === name);
    if (matches.length === 0) unknown.push(name);
    else if (matches.length > 1) ambiguous.push(name);
    else ids.push(matches[0]!.id);
  }
  return { ids: [...new Set(ids)], unknown, ambiguous };
}

export function mergeSelection(checked: Iterable<string>, pasted: string[]): string[] {
  return [...new Set([...checked, ...pasted])];
}

export function toggleCaptureOrder(current: string[], captureId: string): string[] {
  return current.includes(captureId)
    ? current.filter((id) => id !== captureId)
    : [...current, captureId];
}

export function moveCapture(current: string[], captureId: string, direction: -1 | 1): string[] {
  const from = current.indexOf(captureId);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= current.length) return current;
  const next = [...current];
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}
