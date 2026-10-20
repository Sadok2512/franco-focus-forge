import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ECharts } from "echarts";
import type { Map as MlMap, GeoJSONSource } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import { getSignaling } from "@/lib/api/client";
import type { SignalingTimeline, SignalingPoints, SignalingLine } from "@/lib/api/signaling";
import { useCaptureContext, setCaptureContext } from "@/lib/capture-context";
import { KpiMapOSM } from "@/features/kpi/KpiMapOSM";

const layers = ["RRC LTE", "RRC NR", "NAS", "Événements Nemo", "MAC-RACH"];
const colors = ["#2563eb", "#7c3aed", "#ea580c", "#0891b2", "#16a34a"];
const shown = (value: unknown) => (value === null || value === undefined ? "—" : String(value));

const timeShown = (value: number | null | undefined) => (value == null ? "—" : value.toFixed(3));
const radioShown = (value: number | null | undefined, unit: string) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("fr-FR", { maximumFractionDigits: unit === "km/h" ? 1 : 2 }).format(
        value,
      );

function Timeline({
  data,
  onRange,
  selectedTime,
}: {
  data: SignalingTimeline;
  selectedTime: number | null;
  onRange: (range: [number, number] | undefined) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const instance = useRef<ECharts | undefined>(undefined);
  const time = useRef(selectedTime);
  time.current = selectedTime;
  const drawCursor = useCallback(() => {
    instance.current?.setOption({
      series: [
        {
          id: "selection",
          type: "line",
          data: [],
          markLine: {
            symbol: "none",
            silent: true,
            lineStyle: { color: "#dc2626", width: 2 },
            data: time.current === null ? [] : [{ xAxis: time.current }],
          },
        },
      ],
    });
  }, []);
  useEffect(drawCursor, [selectedTime, drawCursor]);
  const callback = useRef(onRange);
  callback.current = onRange;
  useEffect(() => {
    let chart: ECharts | undefined;
    let disposed = false;
    let observer: ResizeObserver | undefined;
    void import("echarts").then((e) => {
      if (disposed || !host.current) return;
      chart = e.init(host.current);
      instance.current = chart;
      chart.setOption({
        animation: false,
        tooltip: { trigger: "axis" },
        legend: { top: 0, left: "center", data: layers, textStyle: { color: "#64748b" } },
        grid: { left: 48, right: 20, top: 40, bottom: 42 },
        xAxis: {
          min: 0,
          type: "value",
          name: "Temps capture (s)",
          nameLocation: "middle",
          nameGap: 26,
        },
        yAxis: { type: "value", name: "Messages" },
        dataZoom: [{ type: "inside", xAxisIndex: 0, zoomOnMouseWheel: "ctrl" }],
        brush: { xAxisIndex: 0, brushType: "lineX", toolbox: ["lineX", "clear"] },
        series: layers.map((name, i) => ({
          id: name,
          name,
          type: "bar",
          stack: "protocol",
          barMaxWidth: 8,
          itemStyle: { color: colors[i] },
          data: data.buckets.map((b) => [b.t_rel_s, b.counts[name]]),
        })),
      });
      drawCursor();
      chart.on("brushEnd", (event: unknown) => {
        const area = (event as { areas?: { coordRange?: number[] }[] }).areas?.[0]?.coordRange;
        callback.current(area?.length === 2 ? [area[0]!, area[1]!] : undefined);
      });
      chart.dispatchAction({
        type: "takeGlobalCursor",
        key: "brush",
        brushOption: { brushType: "lineX" },
      });
      observer = new ResizeObserver(() => chart?.resize());
      observer.observe(host.current);
    });
    return () => {
      disposed = true;
      observer?.disconnect();
      chart?.dispose();
      instance.current = undefined;
    };
  }, [data, drawCursor]);
  return (
    <div
      ref={host}
      className="h-56"
      data-testid="signaling-timeline"
      data-selected-time={selectedTime ?? undefined}
      aria-label="Histogramme temporel, glisser pour filtrer"
    />
  );
}

function SignalMap({
  data,
  onSelect,
  selectedSeq,
}: {
  data: SignalingPoints;
  onSelect: (seq: number) => void;
  selectedSeq: number | undefined;
}) {
  const [map, setMap] = useState<MlMap>();
  const ready = useCallback((m: MlMap) => setMap(m), []);
  const callback = useRef(onSelect);
  callback.current = onSelect;
  useEffect(() => {
    if (!map) return;
    let disposed = false;
    const render = async () => {
      const ml = await import("maplibre-gl");
      if (disposed || !map.isStyleLoaded()) return;
      const features: FeatureCollection = {
        type: "FeatureCollection",
        features: data.markers
          .filter((p) => p.lat !== null && p.lng !== null)
          .map((p) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [p.lng!, p.lat!] },
            properties: {
              seq: p.seq,
              time: timeShown(p.t_rel_s),
              protocol: p.protocol,
              color: colors[layers.indexOf(p.protocol)] ?? "#64748b",
              counts: JSON.stringify(p.counts),
            },
          })),
      };
      const route: FeatureCollection = {
        type: "FeatureCollection",
        features:
          features.features.length > 1
            ? [
                {
                  type: "Feature",
                  properties: {},
                  geometry: {
                    type: "LineString",
                    coordinates: data.markers
                      .filter((p) => p.lat !== null && p.lng !== null)
                      .map((p) => [p.lng!, p.lat!]),
                  },
                },
              ]
            : [],
      };
      const routeSource = map.getSource("signaling-route") as GeoJSONSource | undefined;
      if (routeSource) routeSource.setData(route);
      else {
        map.addSource("signaling-route", { type: "geojson", data: route });
        map.addLayer({
          id: "signaling-route-line",
          type: "line",
          source: "signaling-route",
          paint: { "line-color": "#64748b", "line-width": 2, "line-opacity": 0.5 },
        });
      }
      const source = map.getSource("signaling") as GeoJSONSource | undefined;
      if (source) source.setData(features);
      else {
        map.addSource("signaling", { type: "geojson", data: features });
        map.addLayer({
          id: "signaling-points",
          type: "circle",
          source: "signaling",
          paint: {
            "circle-radius": 5,
            "circle-stroke-width": 1,
            "circle-stroke-color": "#fff",
            "circle-color": ["get", "color"],
          },
        });
      }
      const coordinates = data.markers.filter((p) => p.lat !== null && p.lng !== null);
      if (coordinates.length) {
        const bounds = new ml.LngLatBounds();
        coordinates.forEach((p) => bounds.extend([p.lng!, p.lat!]));
        map.fitBounds(bounds, { padding: 35, maxZoom: 16, duration: 0 });
      }
    };
    if (map.isStyleLoaded()) void render();
    else map.once("load", render);
    const click = (e: import("maplibre-gl").MapMouseEvent) => {
      const f = map.queryRenderedFeatures(e.point, { layers: ["signaling-points"] })[0];
      if (!f) return;
      callback.current(Number(f.properties["seq"]));
      void import("maplibre-gl").then((ml) => {
        if (disposed) return;
        const el = document.createElement("div");
        const counts = JSON.parse(String(f.properties["counts"])) as Record<string, number>;
        el.textContent = `${f.properties["time"]} s · ${Object.entries(counts)
          .map(([k, v]) => `${k}: ${v}`)
          .join(" · ")}`;
        new ml.Popup().setLngLat(e.lngLat).setDOMContent(el).addTo(map);
      });
    };
    map.on("click", "signaling-points", click);
    return () => {
      disposed = true;
      map.off("load", render);
      map.off("click", "signaling-points", click);
    };
  }, [map, data]);
  useEffect(() => {
    if (!map) return;
    let marker: import("maplibre-gl").Marker | undefined;
    let cancelled = false;
    const point = data.points.find((p) => p.seq === selectedSeq);
    if (point?.lat !== null && point?.lat !== undefined && point.lng !== null) {
      void import("maplibre-gl").then((ml) => {
        if (cancelled) return;
        const el = document.createElement("div");
        el.dataset["testid"] = "selected-gps";
        el.dataset["seq"] = String(selectedSeq);
        el.style.cssText =
          "width:18px;height:18px;border:3px solid #dc2626;border-radius:50%;pointer-events:none;background:transparent";
        marker = new ml.Marker({ element: el }).setLngLat([point.lng!, point.lat!]).addTo(map);
      });
    }
    return () => {
      cancelled = true;
      marker?.remove();
    };
  }, [map, data, selectedSeq]);
  if (data.indoor)
    return (
      <div
        role="status"
        className="flex h-56 items-center justify-center rounded border bg-muted text-sm"
      >
        plan {data.floorplan_id ?? "non renseigné"}, pas de position
      </div>
    );
  if (!data.markers.length)
    return (
      <div
        role="status"
        className="flex h-56 items-center justify-center rounded border bg-muted text-sm"
      >
        Aucun GPS précédent prouvé dans cette capture
      </div>
    );
  return (
    <div className="h-56 overflow-hidden rounded border [&>div]:h-full">
      <KpiMapOSM
        center={[data.markers[0]!.lng!, data.markers[0]!.lat!]}
        zoom={13}
        onMapReady={ready}
        showOperatorLegend={false}
        contextLabel="Signalisation"
        measurementStatus={null}
        nPoints={data.positioned_count}
      />
    </div>
  );
}

function Tree({ node }: { node: Record<string, unknown> }) {
  return (
    <ul className="space-y-1 border-l pl-3">
      {Object.entries(node).map(([key, value]) =>
        key === "$value" ? (
          <li key={key} className="font-mono text-primary">
            {shown(value)}
          </li>
        ) : value && typeof value === "object" ? (
          <li key={key}>
            <details open>
              <summary className="cursor-pointer">{key}</summary>
              <Tree node={value as Record<string, unknown>} />
            </details>
          </li>
        ) : (
          <li key={key}>
            {key}: {shown(value)}
          </li>
        ),
      )}
    </ul>
  );
}

export function SignalingPage({
  projectId,
  initialCapture,
  initialSeq,
}: {
  projectId: string;
  initialCapture?: string | undefined;
  initialSeq?: number | undefined;
}) {
  const [sharedCapture, setSharedCapture] = useCaptureContext(projectId);
  const [protocols, setProtocols] = useState(layers),
    [technology, setTechnology] = useState(""),
    [direction, setDirection] = useState(""),
    [search, setSearch] = useState(""),
    [procedure, setProcedure] = useState("");
  const [page, setPage] = useState(1),
    [size, setSize] = useState(100),
    [range, setRange] = useState<[number, number]>(),
    [seq, setSeq] = useState<number | undefined>(initialSeq),
    [sort, setSort] = useState("seq"),
    [order, setOrder] = useState("asc");
  const [hover, setHover] = useState<string[]>([]),
    [tab, setTab] = useState("Arborescence"),
    [exportError, setExportError] = useState("");
  const [selectedRecord, setSelectedRecord] = useState<Partial<SignalingLine>>();
  const selectionCapture = useRef<string | undefined>(undefined);
  const caps = useQuery({
    queryKey: ["signaling-captures", projectId],
    queryFn: ({ signal }) => getSignaling(projectId, "captures", {}, signal),
  });
  const capture =
    sharedCapture && caps.data?.captures.some((c) => c.capture_id === sharedCapture)
      ? sharedCapture
      : caps.data?.captures[0]?.capture_id;
  useEffect(() => {
    if (initialCapture) setCaptureContext(projectId, initialCapture);
  }, [projectId, initialCapture]);
  useEffect(() => {
    if (capture && !sharedCapture) setCaptureContext(projectId, capture);
  }, [capture, sharedCapture, projectId]);
  const base = useMemo(
    () => ({
      capture_id: capture,
      protocols: protocols.join(","),
      technology: technology || undefined,
      direction: direction || undefined,
      q: search || undefined,
      procedure: procedure || undefined,
    }),
    [capture, protocols, technology, direction, search, procedure],
  );
  const filtered = useMemo(
    () => ({ ...base, from_s: range?.[0], to_s: range?.[1] }),
    [base, range],
  );
  const listing = useQuery({
    queryKey: ["signaling", projectId, filtered, page, size, sort, order],
    enabled: !!capture,
    queryFn: ({ signal }) =>
      getSignaling(projectId, "rows", { ...filtered, page, size, sort, order }, signal),
  });
  const timeline = useQuery({
    queryKey: ["signaling-timeline", projectId, base],
    enabled: !!capture,
    queryFn: ({ signal }) => getSignaling(projectId, "timeline", base, signal),
  });
  const points = useQuery({
    queryKey: ["signaling-points", projectId, filtered],
    enabled: !!capture,
    queryFn: ({ signal }) => getSignaling(projectId, "points", filtered, signal),
  });
  const context = useQuery({
    queryKey: ["signaling-context", projectId, capture, seq],
    staleTime: 60000,
    enabled: !!capture && seq !== undefined,
    queryFn: ({ signal }) =>
      getSignaling(projectId, "context", { capture_id: capture, seq }, signal),
  });
  const details = useQuery({
    queryKey: ["signaling-details", projectId, capture, seq],
    staleTime: 60000,
    enabled: !!capture && seq !== undefined,
    queryFn: ({ signal }) =>
      getSignaling(projectId, "details", { capture_id: capture, seq }, signal),
  });
  const initialMessage = useQuery({
    queryKey: ["signaling-initial-message", projectId, capture, initialSeq],
    enabled: !!capture && capture === initialCapture && initialSeq !== undefined,
    queryFn: ({ signal }) =>
      getSignaling(projectId, "rows", { capture_id: capture, seq: initialSeq, size: 1 }, signal),
    staleTime: Infinity,
  });
  const selected =
    selectedRecord?.capture_id === capture && selectedRecord?.seq === seq
      ? selectedRecord
      : (listing.data?.rows.find((r) => r.seq === seq) ??
        initialMessage.data?.rows.find((r) => r.seq === seq));
  useEffect(() => {
    if (selectionCapture.current && selectionCapture.current !== capture) {
      setSeq(undefined);
      setSelectedRecord(undefined);
    }
    selectionCapture.current = capture;
  }, [capture]);
  const position = points.data?.points.find((p) => p.seq === seq);
  const resetPage = () => {
    setPage(1);
    setSeq(undefined);
  };
  const chooseCapture = (cap: string) => {
    setSharedCapture(cap);
    setPage(1);
    setRange(undefined);
    setProcedure("");
    setSeq(undefined);
    setHover([]);
  };
  const chooseSeq = (value: number) => {
    if (!capture) return;
    const row = listing.data?.rows.find((r) => r.seq === value);
    const point = points.data?.points.find((p) => p.seq === value);
    setSelectedRecord(
      row ?? {
        seq: value,
        capture_id: capture,
        t_rel_s: point?.t_rel_s ?? null,
        ...(point ? { protocol: point.protocol } : {}),
      },
    );
    setSeq(value);
    setTab("Arborescence");
  };
  const error = [caps, listing, timeline, points].find((q) => q.isError)?.error;
  const exportCsv = async () => {
    try {
      setExportError("");
      const data = await getSignaling(projectId, "export", filtered);
      const url = URL.createObjectURL(new Blob([data.csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = data.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(String(e));
    }
  };
  return (
    <main className="p-3" data-testid="signaling-page">
      <header className="mb-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Signaling View</h1>
        <span className="text-xs text-muted-foreground">
          Capture unique · ordre seq · sources Nemo et RRC
        </span>
      </header>
      {(error || exportError) && (
        <p role="alert" className="mb-3 rounded border border-destructive p-3 text-sm">
          {String(error?.message ?? exportError)}
        </p>
      )}
      <div className="grid items-start gap-3 xl:grid-cols-[230px_minmax(420px,1fr)_420px]">
        <aside className="row-span-2 space-y-5 rounded-lg border bg-card p-3 text-sm">
          <label className="block">
            Technologie
            <select
              aria-label="Technologie signalisation"
              className="mt-1 w-full rounded border bg-background p-2"
              value={technology}
              onChange={(e) => {
                setTechnology(e.target.value);
                resetPage();
              }}
            >
              <option value="">LTE + NR / états non attribués</option>
              <option>LTE</option>
              <option>NR</option>
            </select>
          </label>
          <fieldset className="space-y-2">
            <legend className="mb-2 font-semibold">Couches</legend>
            {layers.map((p, i) => (
              <label key={p} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={protocols.includes(p)}
                  onChange={(e) => {
                    setProtocols((old) =>
                      e.target.checked ? [...old, p] : old.filter((x) => x !== p),
                    );
                    resetPage();
                  }}
                />
                <span className="h-2 w-2 rounded-full" style={{ background: colors[i] }} />
                {p}
                <span className="ml-auto font-mono text-xs">
                  {shown(listing.data?.protocol_counts[p])}
                </span>
              </label>
            ))}
          </fieldset>
          <label className="block">
            Direction
            <select
              aria-label="Direction"
              className="mt-1 w-full rounded border bg-background p-2"
              value={direction}
              onChange={(e) => {
                setDirection(e.target.value);
                resetPage();
              }}
            >
              <option value="">Toutes</option>
              <option>UL</option>
              <option>DL</option>
              <option value="unknown">Non documentée</option>
            </select>
          </label>
          <label className="block">
            Capture
            <select
              aria-label="Capture signalisation"
              className="mt-1 w-full rounded border bg-background p-2"
              value={capture ?? ""}
              onChange={(e) => chooseCapture(e.target.value)}
            >
              {caps.data?.captures.map((c) => (
                <option key={c.capture_id} value={c.capture_id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            Procédure
            <select
              aria-label="Procédure"
              className="mt-1 w-full rounded border bg-background p-2"
              value={procedure}
              onChange={(e) => {
                setProcedure(e.target.value);
                resetPage();
              }}
            >
              <option value="">Toutes</option>
              {listing.data?.procedures.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.type} · seq {p.seq_start} · {shown(p.duration_ms)} ms · {p.outcome}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            Recherche
            <input
              aria-label="Rechercher un message"
              placeholder="Nom du message"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                resetPage();
              }}
              className="mt-1 w-full rounded border bg-background p-2"
            />
          </label>
          <label className="block">
            Taille de page
            <select
              aria-label="Taille de page"
              value={size}
              onChange={(e) => {
                setSize(Number(e.target.value));
                resetPage();
              }}
              className="ml-2 rounded border bg-background p-1"
            >
              {[50, 100, 250, 500].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          {range && (
            <button className="kpi-button" onClick={() => setRange(undefined)}>
              Effacer la brosse
            </button>
          )}
        </aside>
        <section className="min-w-0 rounded-lg border bg-card p-3">
          <h2 className="text-sm font-semibold">Timeline</h2>
          {timeline.data ? (
            <Timeline
              data={timeline.data}
              selectedTime={selected?.t_rel_s ?? null}
              onRange={(r) => {
                setRange(r);
                resetPage();
              }}
            />
          ) : (
            <p role="status" className="p-10">
              Chargement de la timeline…
            </p>
          )}
        </section>
        <section className="min-w-0 rounded-lg border bg-card p-3">
          <h2 className="mb-2 text-sm font-semibold">Trajet · GPS précédent</h2>
          {points.data ? (
            <SignalMap data={points.data} onSelect={chooseSeq} selectedSeq={seq} />
          ) : (
            <p role="status">Chargement des positions…</p>
          )}
        </section>
        <section className="min-w-0 overflow-hidden rounded-lg border bg-card">
          <header className="flex items-center justify-between border-b p-3 text-sm">
            <span>{shown(listing.data?.total)} messages</span>
            <button
              className="kpi-button"
              disabled={!listing.data}
              onClick={() => void exportCsv()}
            >
              Export CSV
            </button>
          </header>
          <div className="max-h-[65vh] overflow-auto">
            <table className="w-full text-xs" aria-label="Messages de signalisation">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  {[
                    ["seq", "#"],
                    ["t_rel_s", "Temps (s)"],
                    ["protocol", "Couche"],
                    ["direction", "Sens"],
                    ["message_name", "Message"],
                    ["cell", "ECGI / PCI"],
                    ["size_bytes", "Octets"],
                  ].map(([key, label]) => (
                    <th key={key} className="p-2 text-left">
                      {key === "direction" || key === "cell" ? (
                        label
                      ) : (
                        <button
                          onClick={() => {
                            setSort(key!);
                            setOrder((old) => (sort === key && old === "asc" ? "desc" : "asc"));
                            resetPage();
                          }}
                        >
                          {label}
                        </button>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {listing.data?.rows.map((r) => (
                  <tr
                    key={r.seq}
                    data-seq={r.seq}
                    aria-selected={r.seq === seq}
                    data-procedure-highlight={r.procedure_ids.some((id) => hover.includes(id))}
                    onMouseEnter={() => setHover(r.procedure_ids)}
                    onMouseLeave={() => setHover([])}
                    onClick={() => chooseSeq(r.seq)}
                    className={`cursor-pointer border-b hover:bg-accent ${r.seq === seq ? "bg-primary/15" : r.procedure_ids.some((id) => hover.includes(id)) ? "bg-amber-100 dark:bg-amber-900/30" : ""}`}
                  >
                    <td className="p-2 font-mono">{r.seq}</td>
                    <td className="p-2 font-mono">{timeShown(r.t_rel_s)}</td>
                    <td className="p-2 whitespace-nowrap">{r.protocol}</td>
                    <td className="p-2">{shown(r.direction)}</td>
                    <td className="p-2">
                      {r.message_name}
                      {r.procedure_ids.map((id) => {
                        const p = listing.data.procedures.find((p) => p.id === id);
                        return p ? (
                          <div key={id} className="text-[10px] text-muted-foreground">
                            {p.type} · {shown(p.duration_ms)} ms · {p.outcome}
                          </div>
                        ) : null;
                      })}
                    </td>
                    <td className="p-2">
                      {shown(r.ecgi)} / {shown(r.pci)}
                    </td>
                    <td className="p-2">{shown(r.size_bytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <footer className="flex items-center justify-between p-3 text-xs">
            <button
              className="kpi-button"
              disabled={!listing.data || listing.data.page <= 1}
              onClick={() => {
                setPage((listing.data?.page ?? 1) - 1);
                setSeq(undefined);
              }}
            >
              Précédent
            </button>
            <span>
              Page {shown(listing.data?.page)} / {shown(listing.data?.pages)}
            </span>
            <button
              className="kpi-button"
              disabled={!listing.data || listing.data.page >= listing.data.pages}
              onClick={() => {
                setPage((listing.data?.page ?? 1) + 1);
                setSeq(undefined);
              }}
            >
              Suivant
            </button>
          </footer>
          {listing.isFetching && (
            <p role="status" className="p-2 text-xs">
              Chargement des messages…
            </p>
          )}
        </section>
        <section
          className="min-w-0 rounded-lg border bg-card p-3 text-xs"
          aria-label="Détails du message"
        >
          <h2 className="mb-3 text-sm font-semibold">
            {selected?.message_name ?? "Sélectionnez un message"}
          </h2>
          {seq !== undefined && (
            <>
              <dl className="mb-3 grid grid-cols-2 gap-2">
                {Object.entries({
                  Séquence: seq,
                  "Temps (s)": timeShown(selected?.t_rel_s),
                  Sens: selected?.direction,
                  ECGI: context.data?.ecgi ?? selected?.ecgi,
                  PCI: context.data?.radio["pci"]?.value ?? selected?.pci,
                  "Taille (octets)": selected?.size_bytes,
                  "eNB/gNB": context.data?.enb_gnb_id,
                  Secteur: context.data?.sector,
                  Latitude: position?.lat,
                  Longitude: position?.lng,
                  "Vitesse GPS": radioShown(context.data?.radio["speed"]?.value, "km/h"),
                }).map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="break-all font-mono">{shown(v)}</dd>
                  </div>
                ))}
              </dl>
              {context.isPending && <p role="status">Chargement du contexte radio…</p>}
              {context.isError && (
                <p role="alert">
                  Contexte radio indisponible.{" "}
                  <button onClick={() => void context.refetch()}>Réessayer le contexte</button>
                </p>
              )}
              {points.data && (position?.lat == null || position?.lng == null) && (
                <p role="status">Aucune position GPS prouvée pour ce message.</p>
              )}
              <h3 className="border-t pt-3 font-semibold">Contexte radio précédent</h3>
              <div className="my-2 grid grid-cols-2 gap-2">
                {Object.entries(context.data?.radio ?? {}).map(([name, v]) => (
                  <div key={name} title={v.reason ?? `${v.source}, seq ${shown(v.seq)}`}>
                    <span className="text-muted-foreground">{name}</span>
                    <div>
                      {radioShown(v.value, v.unit)} {v.unit}
                    </div>
                    <small>
                      Δseq : {shown(v.seq_gap)} · Δt : {timeShown(v.time_gap_s)}
                      {v.time_gap_s == null ? "" : " s"}
                    </small>
                    <div className="text-xs text-muted-foreground">
                      {v.temporal_relation === "same_timestamp"
                        ? "Précédente en séquence · même horodatage"
                        : "Mesure précédente"}
                    </div>
                  </div>
                ))}
              </div>
              <div role="tablist" className="mt-3 flex flex-wrap gap-1 border-t py-2">
                {["Arborescence", "Vue texte", "Hexadécimal", "Paramètres"].map((name) => (
                  <button
                    role="tab"
                    aria-selected={tab === name}
                    key={name}
                    className={`rounded px-2 py-1 ${tab === name ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                    onClick={() => setTab(name)}
                  >
                    {name}
                  </button>
                ))}
              </div>
              {details.isError ? (
                <p role="alert">
                  Erreur de récupération du décodage.{" "}
                  <button onClick={() => void details.refetch()}>Réessayer le décodage</button>
                </p>
              ) : details.isPending ? (
                <p role="status">Chargement du décodage…</p>
              ) : (
                details.data && (
                  <div
                    className="max-h-[45vh] overflow-auto break-words"
                    data-testid="signaling-details"
                  >
                    {tab === "Arborescence" ? (
                      details.data.parameters.length ? (
                        <Tree node={details.data.tree} />
                      ) : (
                        <p>Décodage ASN.1 indisponible pour ce message</p>
                      )
                    ) : tab === "Vue texte" ? (
                      <pre className="whitespace-pre-wrap">
                        {details.data.text || "Aucun paramètre décodé disponible."}
                      </pre>
                    ) : tab === "Hexadécimal" ? (
                      details.data.hex ? (
                        <pre className="whitespace-pre-wrap break-all">{details.data.hex}</pre>
                      ) : (
                        <p role="status" className="rounded bg-muted p-3">
                          {details.data.hex_reason}
                        </p>
                      )
                    ) : (
                      <ul>
                        {details.data.parameters.map((p, i) => (
                          <li key={`${p.path}:${i}`} className="border-b py-1">
                            <a
                              href={`/rrc?parameter=${encodeURIComponent(p.param_key ?? p.path)}`}
                              className="text-primary underline"
                            >
                              {p.path}
                            </a>{" "}
                            = {shown(p.value)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )
              )}
              <details className="mt-3 text-muted-foreground">
                <summary>Sources et limites</summary>
                <p>{details.data?.tree_source}</p>
                <p>{details.data?.tree_route_gap}</p>
                <p>{context.data?.identity_reason}</p>
                <p>result_id : {details.data?.result_id}</p>
              </details>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
