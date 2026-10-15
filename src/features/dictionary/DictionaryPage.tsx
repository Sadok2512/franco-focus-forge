import { useQueries, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Crosshair,
  Maximize2,
  Minimize2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MultiSelect } from "@/components/bc4/MultiSelect";
import { Chart } from "@/components/bc4/Chart";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/bc4/States";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCellArcepZones, type DictFilters } from "@/lib/api/client";
import type { Operator } from "@/lib/api/schemas";
import type { DictTreeMessage, ParamRow } from "@/lib/api/dictionary-schemas";
import type { Map as MlMap } from "maplibre-gl";
import { PROJECTS_CENTER } from "./center";
import {
  EMPTY_SELECTION,
  dictQ,
  downloadCsv,
  errMsg,
  fmtInt,
  fmtNum,
  fmtShare,
  leafOf,
  type Selection,
} from "./shared";

/* ---------------------------------------------------------------- */
/* Layout utilitaires                                               */
/* ---------------------------------------------------------------- */

function useWidth() {
  const [w, setW] = useState(() => (typeof window === "undefined" ? 1440 : window.innerWidth));
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return w;
}

function Panel({
  title,
  actions,
  children,
  className = "",
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={title}
      className={`panel flex min-h-0 flex-col overflow-hidden ${className}`}
    >
      <header className="flex h-8 shrink-0 items-center justify-between gap-2 border-b px-3">
        <h2 className="truncate text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
        {actions}
      </header>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </section>
  );
}

/** Badge techno (LTE / NR) utilisant les couleurs du design BC4. */
function TechBadge({ system }: { system: "LTE" | "NR" }) {
  return (
    <span
      className={`rounded px-1.5 py-px text-[10px] font-bold tracking-wider ${system === "LTE" ? "bg-primary text-primary-foreground" : "bg-sev-good text-primary-foreground"}`}
    >
      {system}
    </span>
  );
}

/* ---------------------------------------------------------------- */
/* Arbre RRC (colonne gauche)                                       */
/* ---------------------------------------------------------------- */

function Tree({
  projectId,
  filters,
  sel,
  onPick,
}: {
  projectId: string;
  filters: DictFilters;
  sel: Selection;
  onPick: (s: Selection) => void;
}) {
  const tree = useQuery(dictQ.tree(projectId, filters));
  const [open, setOpen] = useState<Set<string>>(() => new Set(["LTE", "NR"]));

  const toggle = (k: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  if (tree.isPending)
    return (
      <div className="space-y-1.5 p-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <LoadingSkeleton key={i} className="h-5" />
        ))}
      </div>
    );
  if (tree.isError)
    return <ErrorState message={errMsg(tree.error)} onRetry={() => tree.refetch()} />;

  return (
    <ul role="tree" aria-label="Explorateur de protocole RRC" className="p-1.5">
      {tree.data.branches.map((branch) => {
        const branchOpen = open.has(branch.system);
        return (
          <li key={branch.system} role="none">
            <button
              role="treeitem"
              aria-expanded={branchOpen}
              aria-level={1}
              onClick={() => toggle(branch.system)}
              className="flex w-full items-center gap-1 rounded px-1 py-1 text-left hover:bg-muted"
            >
              {branchOpen ? (
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
              )}
              <TechBadge system={branch.system} />
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                {fmtInt(branch.count)}
              </span>
            </button>
            {branchOpen && (
              <ul role="group" className="ml-2">
                {branch.messages.length === 0 && (
                  <li
                    role="none"
                    className="pl-5 pr-2 py-1 text-[11px] italic text-muted-foreground"
                  >
                    Aucune observation {branch.system} avec les filtres actifs
                  </li>
                )}
                {branch.messages.map((m) => (
                  <TreeMessage
                    key={`${branch.system}:${m.message}`}
                    system={branch.system}
                    message={m}
                    sel={sel}
                    open={open}
                    toggle={toggle}
                    onPick={onPick}
                  />
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function TreeMessage({
  system,
  message,
  sel,
  open,
  toggle,
  onPick,
}: {
  system: "LTE" | "NR";
  message: DictTreeMessage;
  sel: Selection;
  open: Set<string>;
  toggle: (k: string) => void;
  onPick: (s: Selection) => void;
}) {
  const key = `m:${system}:${message.message}`;
  const isOpen = open.has(key);
  const selectedMsg = sel.system === system && sel.message === message.message && sel.path == null;
  return (
    <li role="none">
      <button
        role="treeitem"
        aria-selected={selectedMsg}
        aria-level={2}
        aria-expanded={isOpen}
        onClick={() => {
          toggle(key);
          onPick({ system, message: message.message, path: null });
        }}
        className={`flex w-full items-center gap-1 rounded px-1 py-1 text-left ${selectedMsg ? "bg-accent font-semibold text-accent-foreground" : "hover:bg-muted"}`}
      >
        {isOpen ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
        )}
        <span className="min-w-0 truncate font-mono text-[11px]">{message.message}</span>
        <span className="ml-auto flex items-center gap-1">
          {message.count > 0 && (
            <span className="rounded-sm border border-sev-good/40 px-1 text-[9px] font-semibold uppercase text-sev-good">
              Observé
            </span>
          )}
          <span className="font-mono text-[10px] text-muted-foreground">
            {fmtInt(message.count)}
          </span>
        </span>
      </button>
      {isOpen && (
        <ul role="group" className="ml-3">
          {message.params.length === 0 ? (
            <li role="none" className="pl-5 pr-2 py-1 text-[11px] italic text-muted-foreground">
              Paramètres indisponibles — aucune valeur ingérée pour ce message
            </li>
          ) : (
            message.params.map((p) => {
              const selectedParam =
                sel.system === system && sel.message === message.message && sel.path === p.param;
              return (
                <li key={`${key}:${p.param}`} role="none">
                  <button
                    role="treeitem"
                    aria-selected={selectedParam}
                    aria-level={3}
                    onClick={() => onPick({ system, message: message.message, path: p.param })}
                    className={`flex w-full items-center gap-1 rounded px-1 py-[2px] text-left ${selectedParam ? "bg-accent font-semibold text-accent-foreground" : "hover:bg-muted"}`}
                    title={p.param}
                  >
                    <span className="w-3 text-muted-foreground">·</span>
                    <span className="min-w-0 truncate font-mono text-[11px]">
                      {leafOf(p.param)}
                    </span>
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                      {fmtInt(p.count)}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </li>
  );
}

/* ---------------------------------------------------------------- */
/* Détail d'un paramètre (colonne droite)                           */
/* ---------------------------------------------------------------- */

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard refusé */
        }
      }}
      className="shrink-0 rounded p-0.5 text-primary hover:bg-muted"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function DetailTable({ row }: { row: ParamRow }) {
  const share = row.share_dominant ?? null;
  const rawDom = row.value_raw_dominant;
  const convDom = row.value_converted_dominant;
  return (
    <div className="rounded-md border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-32 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
              Champ
            </TableHead>
            <TableHead className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
              Valeur
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell className="py-1.5 text-[11.5px] text-muted-foreground">Message</TableCell>
            <TableCell className="py-1.5 font-mono text-[11.5px]">{row.message}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="py-1.5 text-[11.5px] text-muted-foreground">Type ASN.1</TableCell>
            <TableCell className="py-1.5 font-mono text-[11.5px]">
              {row.type ?? <span className="text-muted-foreground">N/D</span>}
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="py-1.5 text-[11.5px] text-muted-foreground">
              Chemin ASN.1
            </TableCell>
            <TableCell className="py-1.5">
              <span className="flex items-start gap-1.5">
                <code className="min-w-0 break-all font-mono text-[10.5px] leading-snug">
                  {row.path}
                </code>
                <CopyButton text={row.path} label="Copier le chemin ASN.1" />
              </span>
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="py-1.5 text-[11.5px] text-muted-foreground">
              Valeur observée
            </TableCell>
            <TableCell className="py-1.5">
              <span className="font-mono text-[11.5px]">
                {rawDom == null ? "N/D" : String(rawDom)}
              </span>{" "}
              <span className="text-[10px] text-muted-foreground">(brute, dominante)</span>
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="py-1.5 text-[11.5px] text-muted-foreground">
              Valeur convertie
            </TableCell>
            <TableCell className="py-1.5">
              {convDom == null ? (
                <span className="text-muted-foreground">N/D</span>
              ) : (
                <span className="font-mono text-[11.5px] font-semibold text-primary">
                  {typeof convDom === "number" ? fmtNum(convDom, 2) : String(convDom)}
                  {row.unit_converted ? ` ${row.unit_converted}` : ""}
                </span>
              )}
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="py-1.5 text-[11.5px] text-muted-foreground">
              Part dominante
            </TableCell>
            <TableCell className="py-1.5 font-mono text-[11.5px]">{fmtShare(share)}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="py-1.5 text-[11.5px] text-muted-foreground">
              Règle de conversion
            </TableCell>
            <TableCell className="py-1.5">
              {row.conversion_rule ? (
                <span>
                  <span className="font-mono text-[11.5px]">{row.conversion_rule.formula}</span>{" "}
                  <span className="text-[10px] text-muted-foreground">
                    — {row.conversion_rule.ref}
                  </span>
                </span>
              ) : row.unit_converted ? (
                <span className="font-mono text-[11.5px]">
                  Unité : {row.unit_converted}{" "}
                  <span className="text-[10px] text-muted-foreground">
                    — règle 3GPP non fournie par l'API
                  </span>
                </span>
              ) : (
                <span className="text-muted-foreground">
                  Aucune règle fournie par l'API — valeurs restituées brutes
                </span>
              )}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Histogramme                                                       */
/* ---------------------------------------------------------------- */

function Histogram({ row }: { row: ParamRow }) {
  // 1.8.1 — Histogramme câblé sur `value_distribution` servi par
  // `/dict/params` (bc4-back 0.15.0). Trois cas :
  //   • Paramètre numérique (au moins un `value_converted` non null) :
  //     abscisse = `value_converted` (string → ordre numérique pour
  //     l'affichage), ordonnée = `count`. L'unité convertie, si
  //     connue, suffixe le label d'axe. Les entrées à `value_converted
  //     === null` sont retenues (fallback `value_raw`) et libellées
  //     « N/D (conversion non appliquée) » en abscisse — jamais 0.
  //   • Paramètre enum (TOUS les `value_converted` sont null) :
  //     abscisse = `value_raw` (ex. "n100"), aucune conversion.
  //   • `value_distribution` vide → EmptyState (voir plus bas).
  //
  // En mode `binned`, le back renvoie les bornes d'intervalle en
  // `value_raw`/`value_converted` ; on garde le label TEL QUEL (pas de
  // re-parsing côté UI) et on signale explicitement « binning actif »
  // sous le chart.
  const mode = row.value_distribution_mode ?? "exact";
  const data = useMemo(() => {
    const dist = row.value_distribution ?? [];
    const isEnumLocal = dist.length > 0 && dist.every((e) => e.value_converted == null);
    const items = dist.map((e) => {
      const useConverted = !isEnumLocal;
      const base = useConverted ? e.value_converted : e.value_raw;
      // Label affiché en abscisse. Si on devrait convertir mais la valeur
      // convertie est null, fallback explicite — jamais 0.
      const label = useConverted && e.value_converted == null ? "N/D" : (base ?? e.value_raw);
      // Clé de tri numérique (quand possible) pour que l'axe soit lisible.
      const numericKey = Number(useConverted ? (e.value_converted ?? NaN) : e.value_raw);
      return {
        label: String(label),
        count: e.count,
        sort: Number.isFinite(numericKey) ? numericKey : Number.POSITIVE_INFINITY,
        raw: String(e.value_raw),
        isEnum: isEnumLocal,
      };
    });
    // Si tri numérique applicable (paramètre numérique en mode exact),
    // on trie par valeur convertie croissante. Sinon on conserve l'ordre
    // du back (déjà trié côté SQL pour `binned` et pour les enums).
    if (!isEnumLocal && mode === "exact") {
      items.sort((a, b) => a.sort - b.sort);
    }
    return items;
  }, [row.value_distribution, mode]);
  const total = data.reduce((a, b) => a + b.count, 0);
  const isEnum = data.length > 0 && data[0]!.isEnum;
  const unitSuffix = !isEnum && row.unit_converted ? ` (${row.unit_converted})` : "";
  const build = (c: { fg: string; muted: string; border: string }) => {
    const primary = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
    return {
      grid: { left: 44, right: 12, top: 18, bottom: 64, containLabel: false },
      tooltip: { trigger: "axis" as const, axisPointer: { type: "shadow" as const } },
      xAxis: {
        type: "category" as const,
        data: data.map((b) => b.label),
        name: isEnum ? "Valeur ASN.1 brute" : `Valeur convertie${unitSuffix}`,
        nameLocation: "middle" as const,
        nameGap: 48,
        axisLabel: {
          color: c.muted,
          fontSize: 9,
          rotate: data.length > 6 ? 40 : 0,
          interval: 0,
          hideOverlap: true,
        },
        axisLine: { lineStyle: { color: c.border } },
      },
      yAxis: {
        type: "value" as const,
        name: "Occurrences",
        nameTextStyle: { color: c.muted, fontSize: 10 },
        axisLabel: { color: c.muted, fontSize: 10 },
        splitLine: { lineStyle: { color: c.border } },
      },
      series: [
        {
          type: "bar" as const,
          data: data.map((b) => b.count),
          itemStyle: { color: primary },
          barMaxWidth: 28,
        },
      ],
    };
  };
  if (!data.length || total === 0)
    return (
      <EmptyState title="Aucune valeur observée">
        Aucune valeur distribuée pour ce paramètre avec les filtres actifs.
      </EmptyState>
    );
  return (
    <div className="flex flex-col gap-1">
      <Chart
        title={`Distribution — ${leafOf(row.path)}`}
        subtitle={`${fmtInt(total)} occurrences · ${fmtInt(data.length)} ${
          isEnum ? "valeurs ASN.1" : "valeurs converties"
        } distinctes`}
        exportName={`distribution_${leafOf(row.path)}`}
        build={build}
        height={240}
      />
      {mode === "binned" && (
        <p className="px-1 text-[10px] italic text-muted-foreground">
          Binning actif — les abscisses sont des bornes d'intervalle servies par le back.
        </p>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Table Opérateur × Bande                                           */
/* ---------------------------------------------------------------- */

function OperatorBandTable({ row }: { row: ParamRow }) {
  const sorted = [...row.buckets].sort(
    (a, b) => a.operator.localeCompare(b.operator) || a.band.localeCompare(b.band),
  );
  if (!sorted.length)
    return (
      <EmptyState title="Aucune ligne">
        Aucune observation par (opérateur, bande) avec les filtres actifs.
      </EmptyState>
    );
  return (
    <div className="rounded-md border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
              Opérateur
            </TableHead>
            <TableHead className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
              Bande
            </TableHead>
            <TableHead className="text-right text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
              Occurrences
            </TableHead>
            <TableHead className="text-right text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
              Moyenne {row.unit_converted ? `(${row.unit_converted})` : ""}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((b, i) => (
            <TableRow key={`${b.operator}·${b.band}·${i}`}>
              <TableCell className="py-1.5 font-mono text-[11.5px]">{b.operator}</TableCell>
              <TableCell className="py-1.5 font-mono text-[11.5px]">{b.band}</TableCell>
              <TableCell className="py-1.5 text-right font-mono text-[11.5px]">
                {b.count === 0 ? (
                  <span className="text-muted-foreground">0 occurrence</span>
                ) : (
                  fmtInt(b.count)
                )}
              </TableCell>
              <TableCell className="py-1.5 text-right font-mono text-[11.5px]">
                {b.avg_converted == null ? (
                  <span className="text-muted-foreground">N/D</span>
                ) : (
                  fmtNum(b.avg_converted, 2)
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Carte des occurrences                                             */
/* ---------------------------------------------------------------- */

type MapPointLike = {
  lat: number;
  lon: number;
  value_raw: string | number | null;
  value_converted: string | number | null;
  operator: string | null;
  band: string | null;
};

function OccurrenceMap({
  points,
  center,
  unit,
}: {
  points: MapPointLike[];
  center: [number, number];
  unit: string | null;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const [ready, setReady] = useState(false);
  const [tileError, setTileError] = useState(false);
  const [full, setFull] = useState(false);

  const geo = useMemo(() => {
    const nums = points
      .map((p) => (typeof p.value_converted === "number" ? p.value_converted : null))
      .filter((v): v is number => v != null && Number.isFinite(v));
    const min = nums.length ? Math.min(...nums) : 0;
    const max = nums.length ? Math.max(...nums) : 1;
    const palette = ["#1769E0", "#52C41A", "#FAAD14", "#F5222D", "#722ED1"];
    const colorOf = (v: number | string | null) => {
      if (typeof v !== "number" || !Number.isFinite(v)) return "rgba(128,128,128,0.6)";
      const t = max === min ? 0.5 : (v - min) / (max - min);
      const idx = Math.min(palette.length - 1, Math.max(0, Math.floor(t * palette.length)));
      return palette[idx]!;
    };
    return {
      type: "FeatureCollection" as const,
      features: points
        .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
        .map((p) => ({
          type: "Feature" as const,
          geometry: {
            type: "Point" as const,
            coordinates: [p.lon, p.lat] as [number, number],
          },
          properties: {
            color: colorOf(
              typeof p.value_converted === "string" ? Number(p.value_converted) : p.value_converted,
            ),
            display:
              p.value_converted == null
                ? "N/D"
                : typeof p.value_converted === "number"
                  ? `${fmtNum(p.value_converted, 2)}${unit ? " " + unit : ""}`
                  : `${p.value_converted}${unit ? " " + unit : ""}`,
            raw: p.value_raw == null ? "N/D" : String(p.value_raw),
            op: p.operator ?? "N/D",
            band: p.band ?? "N/D",
          },
        })),
    };
  }, [points, unit]);

  const fit = () => {
    if (!map.current || !geo.features.length) return;
    const xs = geo.features.map((f) => f.geometry.coordinates[0]);
    const ys = geo.features.map((f) => f.geometry.coordinates[1]);
    map.current.fitBounds(
      [
        [Math.min(...xs), Math.min(...ys)],
        [Math.max(...xs), Math.max(...ys)],
      ],
      { padding: 30, duration: 0 },
    );
  };

  useEffect(() => {
    if (!points.length) return;
    let cancelled = false;
    Promise.all([
      import("maplibre-gl"),
      import("maplibre-gl/dist/maplibre-gl-worker.mjs?url"),
      import("maplibre-gl/dist/maplibre-gl.css"),
    ]).then(([ml, worker]) => {
      if (cancelled || !el.current) return;
      ml.setWorkerUrl(worker.default);
      const m = new ml.Map({
        container: el.current,
        center,
        zoom: 10,
        attributionControl: { compact: true },
        style: {
          version: 8,
          sources: {
            osm: {
              type: "raster",
              tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              tileSize: 256,
              attribution: "© OpenStreetMap",
            },
          },
          layers: [
            {
              id: "osm",
              type: "raster",
              source: "osm",
              paint: { "raster-saturation": -0.8, "raster-opacity": 0.85 },
            },
          ],
        },
      });
      m.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
      m.on("error", (e) => {
        if (String(e.error?.message ?? "").match(/tile|fetch|Failed|load/i)) setTileError(true);
      });
      m.on("load", () => {
        m.addSource("pts", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        m.addLayer({
          id: "pts",
          type: "circle",
          source: "pts",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 3, 14, 7],
            "circle-color": ["get", "color"],
            "circle-stroke-width": 0.7,
            "circle-stroke-color": "rgba(20,34,53,0.55)",
          },
        });
        const popup = new ml.Popup({ closeButton: false, closeOnClick: false, offset: 8 });
        m.on("mousemove", "pts", (e) => {
          m.getCanvas().style.cursor = "pointer";
          const p = e.features?.[0]?.properties as Record<string, string> | undefined;
          if (p)
            popup
              .setLngLat(e.lngLat)
              .setHTML(
                `<div style="font:12px IBM Plex Sans"><b>${p["op"]}</b> · ${p["band"]}<br/>Valeur : ${p["display"]} <span style="color:#888">(brut ${p["raw"]})</span></div>`,
              )
              .addTo(m);
        });
        m.on("mouseleave", "pts", () => {
          m.getCanvas().style.cursor = "";
          popup.remove();
        });
        setReady(true);
      });
      map.current = m;
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center[0], center[1], points.length > 0]);

  useEffect(() => {
    if (!ready || !map.current) return;
    (map.current.getSource("pts") as { setData: (d: unknown) => void } | undefined)?.setData(geo);
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo, ready]);

  useEffect(() => {
    setTimeout(() => {
      map.current?.resize();
      fit();
    }, 40);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full]);

  if (!points.length)
    return (
      <EmptyState title="Aucune position géographique disponible">
        Aucune coordonnée GPS n'est associée à ces observations. Aucune position n'est inventée.
      </EmptyState>
    );
  return (
    <div className="flex flex-col gap-1.5 p-2">
      <div
        className={`relative overflow-hidden rounded-md border ${full ? "fixed inset-4 z-50 shadow-2xl" : "h-[340px]"}`}
      >
        <div
          ref={el}
          className="h-full w-full bg-muted"
          role="region"
          aria-label={`Carte, ${points.length} points`}
        />
        <div className="absolute right-12 top-2.5 z-10 flex gap-1">
          <button
            onClick={fit}
            aria-label="Recentrer sur les données"
            className="panel p-1.5 shadow"
          >
            <Crosshair className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setFull((f) => !f)}
            aria-label={full ? "Quitter plein écran" : "Carte plein écran"}
            className="panel p-1.5 shadow"
          >
            {full ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        </div>
        {tileError && (
          <div
            role="status"
            className="absolute left-2 top-2 z-10 flex items-center gap-1.5 rounded-md bg-warning px-2 py-1 text-[11px] text-warning-foreground"
          >
            <AlertTriangle className="h-3 w-3" /> Fond de carte indisponible — points affichés sans
            tuiles.
          </div>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground">
        {fmtInt(points.length)} points géolocalisés — valeurs issues de /dict/param/map.
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Barre de filtres (5 selects : Op, Bande, DR, Plaque, Zone ARCEP) */
/* ---------------------------------------------------------------- */

function FilterBar({
  filters,
  setFilters,
  operators,
  bands,
  arcepZones,
  drOptions,
  plaqueOptions,
  cellRefEmpty,
}: {
  filters: DictFilters;
  setFilters: (p: Partial<DictFilters>) => void;
  operators: string[];
  bands: string[];
  arcepZones: string[];
  drOptions: string[];
  plaqueOptions: string[];
  cellRefEmpty: boolean;
}) {
  const activeCount =
    (filters.op?.length ?? 0) +
    (filters.band?.length ?? 0) +
    (filters.dr?.length ?? 0) +
    (filters.plaque?.length ?? 0) +
    (filters.arcep?.length ?? 0);
  return (
    <div className="panel flex flex-wrap items-center gap-1.5 px-2 py-1.5">
      <BookOpen className="h-4 w-4 text-primary" aria-hidden />
      <h1 className="mr-2 text-sm font-bold">
        Dictionnaire RRC <span className="font-normal text-muted-foreground">LTE + NR</span>
      </h1>
      <MultiSelect
        label="Opérateur"
        options={operators}
        value={filters.op ?? []}
        onChange={(v) => setFilters({ op: v as Operator[] })}
      />
      <MultiSelect
        label="Bande"
        options={bands}
        value={filters.band ?? []}
        onChange={(v) => setFilters({ band: v })}
      />
      {/* DR / Plaque / Zone ARCEP : grisés tant que cell_ref est vide
          côté back. Le composant MultiSelect ne supporte pas un `disabled`
          natif ; on wrappe pour appliquer un style grisé + ignorer les
          clics, et on expose des options vides. */}
      <DisabledMultiSelect
        label="DR"
        disabled={cellRefEmpty}
        options={drOptions}
        value={filters.dr ?? []}
        onChange={(v) => setFilters({ dr: v })}
      />
      <DisabledMultiSelect
        label="Plaque"
        disabled={cellRefEmpty}
        options={plaqueOptions}
        value={filters.plaque ?? []}
        onChange={(v) => setFilters({ plaque: v })}
      />
      <DisabledMultiSelect
        label="Zone ARCEP"
        disabled={cellRefEmpty}
        options={arcepZones}
        value={filters.arcep ?? []}
        onChange={(v) => setFilters({ arcep: v })}
      />
      {activeCount > 0 && (
        <button
          onClick={() =>
            setFilters({
              op: undefined,
              band: undefined,
              dr: undefined,
              plaque: undefined,
              arcep: undefined,
            })
          }
          className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-primary hover:bg-muted"
        >
          <X className="h-3 w-3" /> Effacer ({activeCount})
        </button>
      )}
      {cellRefEmpty && (
        <span
          className="ml-auto text-[10px] text-muted-foreground"
          title="DR / Plaque / Zone ARCEP requièrent une table cell_ref peuplée"
        >
          cell_ref vide — DR / Plaque / Zone ARCEP indisponibles
        </span>
      )}
    </div>
  );
}

function DisabledMultiSelect({
  label,
  disabled,
  options,
  value,
  onChange,
}: {
  label: string;
  disabled: boolean;
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  if (disabled) {
    return (
      <span
        aria-disabled
        title={`${label} : cell_ref vide`}
        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-dashed bg-card px-2 text-xs opacity-50"
      >
        <span className="text-muted-foreground">{label}</span>
        <span className="text-muted-foreground">—</span>
      </span>
    );
  }
  return <MultiSelect label={label} options={options} value={value} onChange={onChange} />;
}

/* ---------------------------------------------------------------- */
/* DictionaryPage                                                    */
/* ---------------------------------------------------------------- */

export function DictionaryPage({
  projectId,
  filters,
  setFilters,
}: {
  projectId: string;
  filters: DictFilters;
  setFilters: (p: Partial<DictFilters>) => void;
}) {
  const width = useWidth();
  const [sel, setSel] = useState<Selection>(EMPTY_SELECTION);
  const [layoutKey] = useState(0);

  useEffect(() => {
    setSel(EMPTY_SELECTION);
  }, [projectId]);

  const proj = useQuery(dictQ.project(projectId));
  const dims = proj.data?.dimensions;

  // Zone ARCEP : options issues de `/reference/cell/summary.arcep_breakdown`.
  // Tableau vide tant que `cell_ref` est vide (le back renvoie `[]`).
  const arcepQ = useQuery({
    queryKey: ["reference", "cell", "arcep-zones"],
    queryFn: ({ signal }) => getCellArcepZones(signal),
    staleTime: 5 * 60_000,
  });
  // Lot 1.8.0 : DR / Plaque ne sont pas encore exposés côté back pour
  // le Dictionnaire (cell_ref vide). On passe des tableaux vides tant
  // qu'il n'y a rien à proposer — le filtre reste grisé.
  const cellRefEmpty = (arcepQ.data?.length ?? 0) === 0;

  // Détail du paramètre sélectionné : exerce /dict/params avec le
  // couple (system, message) sélectionné, puis filtre le `path` côté UI.
  const paramsQ = useQuery({
    ...dictQ.params(projectId, sel.system ?? "LTE", sel.message ?? "", filters),
    enabled: !!sel.system && !!sel.message,
  });
  const row: ParamRow | null = useMemo(() => {
    if (!sel.path || !paramsQ.data) return null;
    return paramsQ.data.params.find((p) => p.path === sel.path) ?? null;
  }, [paramsQ.data, sel.path]);

  const mapQ = useQuery({
    ...dictQ.map(projectId, sel.path ?? "", sel.system ?? "LTE", filters),
    enabled: !!sel.path && !!sel.system,
  });

  // Préchargement opportuniste des `/dict/params` pour chaque (system,
  // message) ouvert dans l'arbre : évite les clics « blanc » quand on
  // sélectionne un path pour la première fois. On réutilise `useQueries`
  // avec `enabled:false` pour laisser React Query hydrater sans forcer.
  useQueries({ queries: [] });

  const filterBar = (
    <FilterBar
      filters={filters}
      setFilters={setFilters}
      operators={dims?.operators ?? []}
      bands={dims?.bands ?? []}
      arcepZones={arcepQ.data ?? []}
      drOptions={[]}
      plaqueOptions={[]}
      cellRefEmpty={cellRefEmpty}
    />
  );

  const treeNode = <Tree projectId={projectId} filters={filters} sel={sel} onPick={setSel} />;

  const detail = !sel.path ? (
    <EmptyState title="Sélectionnez un paramètre">
      Choisissez un message dans l'arbre, puis un paramètre (feuille ASN.1) pour afficher sa fiche
      détaillée, son histogramme, sa matrice opérateur × bande et sa carte.
    </EmptyState>
  ) : paramsQ.isPending ? (
    <div className="p-3">
      <LoadingSkeleton className="h-72" />
    </div>
  ) : paramsQ.isError ? (
    <ErrorState message={errMsg(paramsQ.error)} onRetry={() => paramsQ.refetch()} />
  ) : !row ? (
    <EmptyState title="Paramètre introuvable">
      L'API n'a renvoyé aucune ligne pour « {sel.path} ». Vérifier le filtrage.
    </EmptyState>
  ) : (
    <div className="flex flex-col gap-3 p-3">
      <header className="flex items-center gap-2">
        <TechBadge system={row.system} />
        <h2 className="truncate font-mono text-base font-bold">{leafOf(row.path)}</h2>
        <span className="ml-auto flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
          <span>{fmtInt(row.count)}</span>
          <span>{row.count === 1 ? "occurrence" : "occurrences"}</span>
        </span>
      </header>
      <DetailTable row={row} />
      {row.count === 0 ? (
        <EmptyState title="Aucune valeur observée">
          Aucune occurrence pour ce paramètre avec les filtres actifs. Histogramme / carte / matrice
          indisponibles.
        </EmptyState>
      ) : (
        <>
          <Histogram row={row} />
          <OperatorBandTable row={row} />
          <div className="flex items-center justify-end">
            <button
              onClick={() =>
                downloadCsv(`param_${leafOf(row.path)}`, [
                  [
                    "operator",
                    "band",
                    "count",
                    `avg_converted${row.unit_converted ? ` (${row.unit_converted})` : ""}`,
                  ],
                  ...row.buckets.map((b) => [b.operator, b.band, b.count, b.avg_converted ?? ""]),
                ])
              }
              className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] hover:bg-muted"
            >
              Exporter la matrice en CSV
            </button>
          </div>
          {mapQ.isPending ? (
            <div className="p-2">
              <LoadingSkeleton className="h-[340px]" />
            </div>
          ) : mapQ.isError ? (
            <ErrorState message={errMsg(mapQ.error)} onRetry={() => mapQ.refetch()} />
          ) : (
            <OccurrenceMap
              points={mapQ.data?.points ?? []}
              center={PROJECTS_CENTER(projectId)}
              unit={row.unit_converted}
            />
          )}
        </>
      )}
    </div>
  );

  return (
    <div className="flex min-h-[calc(100vh-56px)] flex-col gap-2 p-2 lg:h-[calc(100vh-56px)]">
      {filterBar}
      <p className="px-1 text-[11px] text-muted-foreground" aria-live="polite">
        Sélection :{" "}
        {sel.system ? <span className="font-semibold">{sel.system} › </span> : "aucun système"}
        {sel.message ? <span className="font-mono">{sel.message}</span> : null}
        {sel.path && (
          <>
            {" "}
            › <span className="font-mono font-semibold text-foreground">{leafOf(sel.path)}</span>
          </>
        )}
      </p>

      {width >= 1024 ? (
        <ResizablePanelGroup
          key={layoutKey}
          orientation="horizontal"
          className="min-h-0 flex-1 gap-0"
        >
          <ResizablePanel defaultSize="28%" minSize="18%">
            <Panel title="Arbre RRC" className="h-full">
              {treeNode}
            </Panel>
          </ResizablePanel>
          <ResizableHandle withHandle className="mx-1" />
          <ResizablePanel defaultSize="72%" minSize="40%">
            <Panel title="Paramètres du message" className="h-full">
              {detail}
            </Panel>
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <div className="grid gap-2">
          <Panel title="Arbre RRC" className="h-[420px]">
            {treeNode}
          </Panel>
          <Panel title="Paramètres du message" className="min-h-[500px]">
            {detail}
          </Panel>
        </div>
      )}
    </div>
  );
}
