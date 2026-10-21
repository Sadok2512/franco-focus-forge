/** Single semantic palette for RF tracks, radio series and selection. */
export const rfColors: Record<string, string> = {
  lte: "#1769E0",
  nsa: "#8B5CF6",
  sa: "#16A34A",
  dl: "#0284C7",
  ul: "#10B981",
  volte: "#F97316",
  vonr: "#9333EA",
  mobility: "#2563EB",
  failure: "#DC2626",
  network: "#64748B",
  cell_rsrp: "#1769E0",
  cell_rsrq: "#16A34A",
  ci_rs_snr: "#F97316",
  unknown: "#94A3B8",
  selection: "#FBBF24",
};

export const rfProtocolColors: Record<string, string> = {
  "RRC LTE": rfColors["lte"]!,
  "RRC NR": rfColors["nsa"]!,
  NAS: "#EA580C",
  Nemo: "#0891B2",
  "Événements Nemo": "#0891B2",
  "MAC-RACH": "#16A34A",
  Procedures: "#64748B",
};
