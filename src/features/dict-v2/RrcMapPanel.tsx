import { retryRrcRequest, rrcRetryDelay, rrcRequestMessage } from "./request-recovery";
import { useQuery } from "@tanstack/react-query";
import type { Map as MlMap } from "maplibre-gl";
import { getDictV2Map } from "@/lib/api/client";
import type { DictGeoFilters } from "@/lib/api/dict-v2";
import { RrcMapLayers } from "./RrcMapLayers";
import { fitRrcPoints } from "./map-view";
import { useRef, useState, type CSSProperties } from "react";
import { KpiMapOSM } from "@/features/kpi/KpiMapOSM";

export function RrcMapPanel({
  projectId,
  keys,
  geographic,
  technology,
  operators,
  bands,
  selectedCount,
}: {
  projectId: string;
  keys: string[];
  geographic: DictGeoFilters;
  technology: string;
  operators: string[];
  bands: string[];
  selectedCount: number;
}) {
  const [map, setMap] = useState<MlMap | null>(null);
  const query = useQuery({
    queryKey: ["dict-v2", "map", projectId, keys, technology, operators, bands, geographic],
    queryFn: () => getDictV2Map(projectId, keys, technology, operators, bands, geographic),
    enabled: !!projectId && keys.length > 0,
    staleTime: 60000,
    retry: retryRrcRequest,
    retryDelay: rrcRetryDelay,
  });
  const data = keys.length ? query.data : undefined;
  const status = !keys.length
    ? "Sélectionnez un paramètre"
    : query.isError
      ? rrcRequestMessage(query.error)
      : query.isFetching
        ? query.failureCount > 0
          ? "Reconnexion au serveur…"
          : "Chargement des mesures…"
        : !data?.points.length
          ? "Aucun point géolocalisé"
          : null;
  const [height, setHeight] = useState(() => {
    if (typeof window === "undefined") return 400;
    try {
      const saved = Number(sessionStorage.getItem("bc4.rrc.mapHeight"));
      return saved >= 240 && saved <= 800
        ? saved
        : Math.min(450, Math.max(350, window.innerHeight * 0.42));
    } catch {
      return 400;
    }
  });
  const [fullscreen, setFullscreen] = useState(false);
  const drag = useRef<{ y: number; height: number } | null>(null);
  const resize = (next: number) => {
    const value = Math.round(Math.min(800, Math.max(240, next)));
    setHeight(value);
    try {
      sessionStorage.setItem("bc4.rrc.mapHeight", String(value));
    } catch {
      /* Storage may be disabled. */
    }
  };
  return (
    <section
      className="rrc-map-panel rrc-map-premium"
      aria-label="Carte des mesures RRC"
      style={{ "--rrc-map-height": `${height}px` } as CSSProperties}
    >
      <span className="sr-only">
        Carte · {technology} · {operators.join(", ") || "Tous les opérateurs"} ·{" "}
        {bands.join(", ") || "Toutes les bandes"} · {selectedCount} paramètre(s) sélectionné(s)
      </span>
      <KpiMapOSM
        premium
        contextLabel="RRC"
        showOperatorLegend={false}
        onFullscreenChange={setFullscreen}
        onMapReady={setMap}
        onRecenter={data?.points.length ? () => fitRrcPoints(map, data.points) : undefined}
        measurementStatus={status}
      >
        {data && data.points.length > 0 && <RrcMapLayers map={map} data={data} />}
        {data && (
          <div
            className="rrc-map-coverage"
            style={status ? { bottom: 35 } : undefined}
            role="status"
            title={data.reason ?? "Sous-population géolocalisée des valeurs RRC filtrées"}
          >
            {data.geolocated_occurrences} / {data.total_occurrences} occurrences géolocalisées
            {data.truncated &&
              ` · ${data.returned_occurrences} premières affichées (limite ${data.limit})`}
          </div>
        )}
        {query.isError && (
          <button
            className="rrc-map-retry"
            aria-label="Réessayer la carte"
            title={query.error instanceof Error ? query.error.message : undefined}
            onClick={() => query.refetch()}
          >
            Réessayer
          </button>
        )}
      </KpiMapOSM>
      {!fullscreen && (
        <div
          role="separator"
          tabIndex={0}
          aria-label="Redimensionner la hauteur de la carte"
          aria-orientation="horizontal"
          aria-valuemin={240}
          aria-valuemax={800}
          aria-valuenow={Math.round(height)}
          aria-valuetext={`${Math.round(height)} pixels`}
          title="Glisser pour redimensionner · Flèches haut/bas · Double-clic pour réinitialiser"
          className="rrc-map-resize-handle"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.focus();
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = { y: event.clientY, height };
          }}
          onPointerMove={(event) => {
            if (drag.current) resize(drag.current.height + event.clientY - drag.current.y);
          }}
          onPointerUp={(event) => {
            drag.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onLostPointerCapture={() => {
            drag.current = null;
          }}
          onDoubleClick={() => resize(400)}
          onKeyDown={(event) => {
            const next =
              event.key === "ArrowUp"
                ? height - 20
                : event.key === "ArrowDown"
                  ? height + 20
                  : event.key === "Home"
                    ? 240
                    : event.key === "End"
                      ? 800
                      : null;
            if (next !== null) {
              event.preventDefault();
              resize(next);
            }
          }}
        >
          <span />
        </div>
      )}
    </section>
  );
}
