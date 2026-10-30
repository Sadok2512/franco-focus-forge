export type MetricSelection = {
  full: string;
  code: string;
  cell: string;
  system: "LTE" | "NR" | null;
  cellType: number | null;
  arfcn: number | null;
  pci: number | null;
};

// Current catalogue contract:
//   code
//   code@<legacy index>
//   code@lte-type-N / code@nr-type-N
//   code@lte-type-N!ARFCN:PCI / code@nr-type-N!ARFCN:PCI
const SELECTION = /^([A-Za-z][A-Za-z0-9_]*)(?:@((?:(lte|nr)-type-(\d+)|\d+)(?:!(\d+):(\d+))?))?$/;

/** Parse one catalogue selector without exposing the storage index in UI code. */
export function parseMetricSelection(full: string): MetricSelection | null {
  const match = SELECTION.exec(full);
  if (!match) return null;
  const legacy = match[2] && /^\d+$/.test(match[2]) ? Number(match[2]) : null;
  return {
    full,
    code: match[1]!,
    cell: match[2] ?? "all",
    system: match[3] ? (match[3].toUpperCase() as "LTE" | "NR") : null,
    cellType: match[4] === undefined ? legacy : Number(match[4]),
    arfcn: match[5] === undefined ? null : Number(match[5]),
    pci: match[6] === undefined ? null : Number(match[6]),
  };
}
