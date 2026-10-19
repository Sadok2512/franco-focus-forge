import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Map as MlMap,
  GeoJSONSource,
  MapLayerMouseEvent,
  Popup,
  GeoJSONSourceSpecification,
} from "maplibre-gl";
import { fitRrcPoints } from "./map-view";
import type { DictMapPoint, DictMapResponse } from "@/lib/api/dict-v2";

const palette = ["#1769E0", "#16A34A", "#9333EA", "#D97706", "#DB2777", "#0891B2", "#64748B"];
const categoryColor = (index: number) =>
  palette[index] ?? `hsl(${(index * 137.508) % 360},65%,45%)`;
const valueOf = (p: DictMapPoint) => p.value_converted ?? p.value_raw ?? "—";

export function RrcMapLayers({ map, data }: { map: MlMap | null; data: DictMapResponse }) {
  const [popupError, setPopupError] = useState(false);
  const [mode, setMode] = useState("operator");
  const [parameter, setParameter] = useState("");
  const parameters = useMemo(
    () => [
      ...new Map(data.points.map((p) => [p.param_key, p.display_name ?? p.param_key])).entries(),
    ],
    [data],
  );
  const selected = parameters.some(([key]) => key === parameter) ? parameter : parameters[0]?.[0];
  const points = useMemo(
    () => (mode === "operator" ? data.points : data.points.filter((p) => p.param_key === selected)),
    [data, mode, selected],
  );
  const categories = useMemo(() => [...new Set(points.map(valueOf))].sort(), [points]);
  const unit = points[0]?.unit;
  const numeric =
    mode === "value" &&
    !!unit &&
    points.length > 0 &&
    points.every(
      (p) =>
        p.unit === unit &&
        p.value_converted !== null &&
        p.value_converted.trim() !== "" &&
        Number.isFinite(Number(p.value_converted)),
    );
  const lo = numeric ? Math.min(...points.map((p) => Number(p.value_converted))) : 0;
  const hi = numeric ? Math.max(...points.map((p) => Number(p.value_converted))) : 0;
  const colored = useMemo(
    () =>
      points.map((p) => ({
        ...p,
        color:
          mode === "operator"
            ? p.operator_color
            : numeric
              ? `hsl(${220 - 200 * (hi === lo ? 0.5 : (Number(p.value_converted) - lo) / (hi - lo))},75%,48%)`
              : categoryColor(categories.indexOf(valueOf(p))),
      })),
    [points, mode, numeric, lo, hi, categories],
  );
  const fitted = useRef<DictMapResponse | null>(null);

  useEffect(() => {
    if (!map) return;
    let cancelled = false;
    let popup: Popup | undefined;
    const sourceId = "rrc-observations";
    const sourceData: GeoJSONSourceSpecification["data"] = {
      type: "FeatureCollection",
      features: colored.map((p) => ({
        type: "Feature",
        id: p.occurrence_id,
        geometry: { type: "Point", coordinates: [p.lon, p.lat] },
        properties: { id: p.occurrence_id, color: p.color },
      })),
    };
    map.addSource(sourceId, {
      type: "geojson",
      data: sourceData,
      cluster: true,
      clusterRadius: 28,
      clusterMaxZoom: 14,
    });
    map.addLayer({
      id: "rrc-clusters",
      type: "circle",
      source: sourceId,
      filter: ["has", "point_count"],
      paint: {
        "circle-color": "#475569",
        "circle-radius": ["step", ["get", "point_count"], 12, 100, 17, 1000, 22],
        "circle-stroke-color": "#fff",
        "circle-stroke-width": 2,
      },
    });
    map.addLayer({
      id: "rrc-points",
      type: "circle",
      source: sourceId,
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": ["get", "color"],
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 4, 16, 7],
        "circle-stroke-color": "#fff",
        "circle-stroke-width": 1.5,
      },
    });
    if (fitted.current !== data) {
      fitRrcPoints(map, points);
      fitted.current = data;
    }
    const byId = new Map(colored.map((p) => [p.occurrence_id, p]));
    const show = async (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      if (!feature) return;
      const cluster = feature.properties?.["cluster_id"] as number | undefined;
      const source = map.getSource(sourceId) as GeoJSONSource;
      const matches =
        cluster !== undefined
          ? await source.getClusterLeaves(cluster, 100, 0)
          : map.queryRenderedFeatures(
              [
                [event.point.x - 5, event.point.y - 5],
                [event.point.x + 5, event.point.y + 5],
              ],
              { layers: ["rrc-points"] },
            );
      const observations = [
        ...new Map(
          matches.map((f) => [String(f.properties?.id), byId.get(String(f.properties?.id))]),
        ).values(),
      ].filter((p): p is (typeof colored)[number] => !!p);
      if (!observations.length || cancelled) return;
      const { Popup: MapPopup } = await import("maplibre-gl");
      if (cancelled) return;
      const root = document.createElement("div");
      root.className = "rrc-map-proof";
      const mapHeight = map.getCanvas().clientHeight;
      root.style.maxHeight = `${Math.max(100, Math.min(260, mapHeight - 100))}px`;
      const heading = document.createElement("strong");
      const total =
        cluster !== undefined ? Number(feature.properties?.["point_count"]) : observations.length;
      heading.textContent = `${total} occurrence(s)${total > observations.length ? ` · ${observations.length} premières affichées` : ""}`;
      root.append(heading);
      const select = document.createElement("select");
      select.setAttribute("aria-label", "Occurrence RRC");
      observations.forEach((p, i) => {
        const option = document.createElement("option");
        option.value = String(i);
        option.textContent = `${p.operator ?? "N/D"} · ${p.display_name ?? p.param_key} : ${valueOf(p)} ${p.unit ?? ""}`;
        select.append(option);
      });
      root.append(select);
      const details = document.createElement("dl");
      root.append(details);
      const render = (p: DictMapPoint) => {
        details.replaceChildren();
        Object.entries({
          Opérateur: p.operator,
          Technologie: p.technology,
          Bande: p.band,
          Paramètre: p.display_name ?? p.param_key,
          "Valeur brute": p.value_raw,
          "Valeur convertie": p.value_converted,
          Unité: p.unit,
          Latitude: p.lat,
          Longitude: p.lon,
          Capture: p.capture_id,
          Seq: p.seq,
          Source: p.source,
          "Fichier NMF": p.nmf_file_id,
          "Chemin ASN.1": p.path,
        }).forEach(([key, value]) => {
          const row = document.createElement("div"),
            dt = document.createElement("dt"),
            dd = document.createElement("dd");
          dt.textContent = key;
          dd.textContent = value == null ? "—" : String(value);
          row.append(dt, dd);
          details.append(row);
        });
      };
      select.onchange = () => render(observations[Number(select.value)]!);
      render(observations[0]!);
      if (cluster !== undefined) {
        const zoom = document.createElement("button");
        zoom.textContent = "Zoomer sur le groupe";
        zoom.onclick = async () => {
          const level = await source.getClusterExpansionZoom(cluster);
          if (!cancelled) map.easeTo({ center: event.lngLat, zoom: level });
        };
        root.append(zoom);
      }
      popup?.remove();
      popup = new MapPopup({ maxWidth: "360px", anchor: "bottom", offset: 10 })
        .setLngLat(event.lngLat)
        .setDOMContent(root)
        .addTo(map);
      map.easeTo({ center: event.lngLat, offset: [0, mapHeight / 2 - 35], duration: 250 });
      setPopupError(false);
    };
    const click = (event: MapLayerMouseEvent) => {
      void show(event).catch(() => {
        if (!cancelled) setPopupError(true);
      });
    };
    const enter = () => {
        map.getCanvas().style.cursor = "pointer";
      },
      leave = () => {
        map.getCanvas().style.cursor = "";
      };
    for (const layer of ["rrc-points", "rrc-clusters"]) {
      map.on("click", layer, click);
      map.on("mouseenter", layer, enter);
      map.on("mouseleave", layer, leave);
    }
    return () => {
      cancelled = true;
      popup?.remove();
      for (const layer of ["rrc-points", "rrc-clusters"]) {
        map.off("click", layer, click);
        map.off("mouseenter", layer, enter);
        map.off("mouseleave", layer, leave);
        if (map.getLayer(layer)) map.removeLayer(layer);
      }
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    };
  }, [map, colored, data, points]);

  return (
    <>
      {popupError && (
        <p role="alert" className="rrc-map-retry">
          Infobulle indisponible. Cliquez à nouveau sur le point.
        </p>
      )}
      <div className="rrc-map-color-controls">
        <select
          aria-label="Coloration de la carte"
          value={mode}
          onChange={(e) => setMode(e.target.value)}
        >
          <option value="operator">Par opérateur</option>
          <option value="value">Par valeur</option>
        </select>
        {mode === "value" && (
          <select
            aria-label="Paramètre de coloration"
            value={selected}
            onChange={(e) => setParameter(e.target.value)}
          >
            {parameters.map(([key, name]) => (
              <option value={key} key={key}>
                {name}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="rrc-map-legend" aria-label="Légende des mesures">
        <strong>{mode === "operator" ? "Opérateurs" : `Valeurs${unit ? ` (${unit})` : ""}`}</strong>
        {mode === "operator" ? (
          data.operators.map((op) => (
            <div key={op.name}>
              <i style={{ background: op.color }} />
              {op.name} <b>({op.count})</b>
            </div>
          ))
        ) : numeric ? (
          <>
            <div
              style={{
                height: 8,
                background: "linear-gradient(to right,hsl(220,75%,48%),hsl(20,75%,48%))",
              }}
            />
            <div>
              {lo} — {hi} {unit}
            </div>
          </>
        ) : (
          categories.map((v, i) => (
            <div key={v}>
              <i style={{ background: categoryColor(i) }} />
              {v}
            </div>
          ))
        )}
        <small>{points.length} occurrence(s) affichée(s)</small>
      </div>
    </>
  );
}
