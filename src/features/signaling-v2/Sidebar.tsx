import { ChevronUp, RotateCcw } from "lucide-react";
import { useState } from "react";
import type { SigCaptureMeta } from "@/lib/api/signaling-schemas-v2";
import { fmtNum } from "./shared";

export type SidebarFilters = {
  tech: "LTE" | "NR";
  layers: Set<string>;
  dir: "Toutes" | "UL" | "DL";
  procedure: "Toutes" | string;
};

export const DEFAULT_SIDEBAR: SidebarFilters = {
  tech: "NR",
  layers: new Set(["RRC NR", "RRC LTE", "NAS", "Événements Nemo", "MAC-RACH"]),
  dir: "Toutes",
  procedure: "Toutes",
};

const LAYER_DEFS: { key: string; label: string; dot: string }[] = [
  { key: "RRC NR", label: "RRC NR", dot: "#9333EA" },
  { key: "RRC LTE", label: "RRC LTE", dot: "#F97316" },
  { key: "NAS", label: "NAS", dot: "#16A34A" },
  { key: "Événements Nemo", label: "Événements Nemo", dot: "#1769E0" },
  { key: "MAC-RACH", label: "MAC-RACH", dot: "#0D9488" },
];

export const PROCEDURES = ["RRC", "NAS", "RACH", "Nemo", "EN-DC", "HO", "HO-Drop", "VoNR", "VoLTE", "Data"];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border-b px-3 py-2">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between text-[11px] font-semibold">
        {title}
        <ChevronUp className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? "" : "rotate-180"}`} />
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}

export function Sidebar({
  captures,
  captureId,
  onCapture,
  filters,
  onFilters,
  layerCounts,
}: {
  captures: SigCaptureMeta[];
  captureId: string | null;
  onCapture: (id: string) => void;
  filters: SidebarFilters;
  onFilters: (f: SidebarFilters) => void;
  layerCounts: Record<string, number>;
}) {
  const capture = captures.find((c) => c.id === captureId);
  return (
    <div className="flex h-full flex-col text-[12px]">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h2 className="text-xs font-semibold">Filtres</h2>
        <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <Section title="Technologie">
          <div className="flex gap-1">
            {(["LTE", "NR"] as const).map((t) => (
              <button
                key={t}
                onClick={() => onFilters({ ...filters, tech: t })}
                aria-pressed={filters.tech === t}
                className={`flex-1 rounded border px-2 py-1 text-[11px] font-medium ${filters.tech === t ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
              >
                {t}
              </button>
            ))}
          </div>
        </Section>
        <Section title="Couches">
          <div className="space-y-1">
            {LAYER_DEFS.map((l) => (
              <label key={l.key} className="flex cursor-pointer items-center gap-2 text-[11px]">
                <input
                  type="checkbox"
                  checked={filters.layers.has(l.key)}
                  onChange={() => {
                    const layers = new Set(filters.layers);
                    if (layers.has(l.key)) layers.delete(l.key);
                    else layers.add(l.key);
                    onFilters({ ...filters, layers });
                  }}
                />
                <span className="h-2 w-2 rounded-full" style={{ background: l.dot }} />
                <span>{l.label}</span>
                <span className="num ml-auto font-mono text-[10px] text-muted-foreground">{fmtNum(layerCounts[l.key] ?? 0)}</span>
              </label>
            ))}
          </div>
        </Section>
        <Section title="Direction">
          <select
            aria-label="Direction"
            value={filters.dir}
            onChange={(e) => onFilters({ ...filters, dir: e.target.value as SidebarFilters["dir"] })}
            className="h-7 w-full rounded border bg-background px-1.5 text-[11px]"
          >
            {(["Toutes", "UL", "DL"] as const).map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </Section>
        <Section title="Capture">
          <select
            aria-label="Capture"
            value={captureId ?? ""}
            onChange={(e) => onCapture(e.target.value)}
            className="h-7 w-full rounded border bg-background px-1.5 text-[11px]"
          >
            {captures.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} - {c.captured_at}
              </option>
            ))}
          </select>
          {capture && (
            <p className="num mt-1 font-mono text-[10px] text-muted-foreground">
              {fmtNum(capture.message_count)} messages · {capture.duration_s.toLocaleString("fr-FR", { maximumFractionDigits: 3 })} s
            </p>
          )}
        </Section>
        <Section title="Procédure">
          <select
            aria-label="Procédure"
            value={filters.procedure}
            onChange={(e) => onFilters({ ...filters, procedure: e.target.value })}
            className="h-7 w-full rounded border bg-background px-1.5 text-[11px]"
          >
            <option value="Toutes">Toutes</option>
            {PROCEDURES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </Section>
      </div>
      <div className="border-t p-3">
        <button
          onClick={() => onFilters({ ...DEFAULT_SIDEBAR, layers: new Set(DEFAULT_SIDEBAR.layers) })}
          className="flex w-full items-center justify-center gap-1.5 rounded border px-2 py-1.5 text-[11px] text-muted-foreground hover:bg-muted"
        >
          <RotateCcw className="h-3 w-3" /> Réinitialiser les filtres
        </button>
      </div>
    </div>
  );
}
