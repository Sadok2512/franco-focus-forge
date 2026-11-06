import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getSignaling } from "@/lib/api/client";
import type { RfEvent } from "@/lib/api/signaling";
import { RfTimeline } from "@/features/signaling/RfTimeline";
import { eventColor, eventId, useActiveEvents } from "./active-events";
import { usePointSync } from "./point-sync";

const L3_PROTOCOLS = ["RRC LTE", "RRC NR", "NAS", "MAC-RACH"];
const TIMELINE_PROTOCOLS = [...L3_PROTOCOLS, "Événements Nemo"];

export function KpiL3SignalingSection({
  projectId,
  captureId,
}: {
  projectId: string;
  captureId: string;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [technology, setTechnology] = useState("");
  const [direction, setDirection] = useState("");
  const [page, setPage] = useState(1);
  const [selectedSeq, setSelectedSeq] = useState<number | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 180);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => setPage(1), [captureId, query, technology, direction]);
  const listing = useQuery({
    queryKey: ["kpi-l3-signaling", projectId, captureId, query, technology, direction, page],
    queryFn: ({ signal }) =>
      getSignaling(
        projectId,
        "rows",
        {
          capture_id: captureId,
          protocols: L3_PROTOCOLS.join(","),
          technology: technology || undefined,
          direction: direction || undefined,
          q: query || undefined,
          page,
          size: 100,
          sort: "seq",
          order: "asc",
        },
        signal,
      ),
    staleTime: 60_000,
  });
  return (
    <section className="kpi-l3-section" data-testid="kpi-l3-signaling-section">
      <header className="kpi-l3-toolbar">
        <label className="sig-search">
          <Search size={14} aria-hidden="true" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label={t("sigTable.search")}
            placeholder={t("sigTable.searchPlaceholder")}
          />
        </label>
        <select
          className="sig-select"
          value={technology}
          onChange={(event) => setTechnology(event.target.value)}
          aria-label={t("sigTable.technology")}
        >
          <option value="">{t("sigTable.allTechnologies")}</option>
          <option value="LTE">LTE</option>
          <option value="NR">NR</option>
        </select>
        <select
          className="sig-select"
          value={direction}
          onChange={(event) => setDirection(event.target.value)}
          aria-label={t("sigTable.direction")}
        >
          <option value="">{t("sigTable.allDirections")}</option>
          <option value="UL">UL</option>
          <option value="DL">DL</option>
        </select>
        <span className="ml-auto text-xs text-muted-foreground">
          {listing.data
            ? t("sigTable.count", { n: listing.data.total, count: listing.data.total })
            : t("sigTable.countPending")}
        </span>
      </header>
      <div className="kpi-l3-table-scroll">
        {listing.isPending ? (
          <p role="status" className="p-4 text-xs">
            {t("sigTable.loading")}
          </p>
        ) : listing.isError ? (
          <p role="alert" className="p-4 text-xs text-destructive">
            {String(listing.error.message)}
          </p>
        ) : (
          <table className="sig-table" aria-label={t("sigTable.title")}>
            <thead>
              <tr>
                <th className="num">{t("sigTable.col.seq")}</th>
                <th className="num">{t("sigTable.col.t_rel_s")}</th>
                <th>{t("sigTable.col.layer")}</th>
                <th>{t("sigTable.col.direction")}</th>
                <th>{t("sigTable.col.technology")}</th>
                <th>{t("sigTable.col.message_name")}</th>
                <th>{t("sigTable.col.source")}</th>
              </tr>
            </thead>
            <tbody>
              {listing.data?.rows.map((row) => (
                <tr
                  key={row.seq}
                  className="sig-virtual-row"
                  aria-selected={selectedSeq === row.seq}
                  onClick={() => setSelectedSeq(row.seq)}
                >
                  <td className="num">{row.seq}</td>
                  <td className="num">{row.t_rel_s?.toFixed(3) ?? "—"}</td>
                  <td>{row.protocol}</td>
                  <td>{row.direction ?? "—"}</td>
                  <td>{row.technology ?? "—"}</td>
                  <td>{row.message_name}</td>
                  <td>{row.source || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {listing.data?.rows.length === 0 && (
          <p role="status" className="p-6 text-center text-xs text-muted-foreground">
            {t("sigTable.empty")}
          </p>
        )}
      </div>
      <footer className="kpi-l3-footer">
        <button
          type="button"
          className="sig-page"
          aria-label={t("sigTable.previous")}
          disabled={!listing.data || listing.data.page <= 1}
          onClick={() => setPage((value) => value - 1)}
        >
          <ChevronLeft size={14} />
        </button>
        <span>
          {listing.data ? `${listing.data.page} / ${Math.max(1, listing.data.pages)}` : "—"}
        </span>
        <button
          type="button"
          className="sig-page"
          aria-label={t("sigTable.next")}
          disabled={!listing.data || listing.data.page >= listing.data.pages}
          onClick={() => setPage((value) => value + 1)}
        >
          <ChevronRight size={14} />
        </button>
      </footer>
    </section>
  );
}

export function KpiTimelineSection({
  projectId,
  captureId,
  workspaceId,
  persistenceId,
}: {
  projectId: string;
  captureId: string;
  workspaceId: string;
  persistenceId: string;
}) {
  const [selectedTime, setSelectedTime] = useState<number | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const activeEvents = useActiveEvents();
  const { select: selectPoint } = usePointSync();
  useEffect(() => {
    setSelectedTime(null);
    setSelectedEventId(null);
    selectPoint(null);
  }, [captureId, selectPoint]);
  const selectEvent = (event: RfEvent) => {
    setSelectedEventId(event.id);
    setSelectedTime(event.t_rel_s);
    if (event.t_rel_s !== null) {
      activeEvents.toggle({
        id: eventId(captureId, event.type, event.seq),
        captureId,
        t_rel_s: event.t_rel_s,
        label: event.label,
        type: event.type,
        color: eventColor(event.type),
      });
    }
    selectPoint({
      projectId,
      workspaceId,
      captureId,
      seq: event.seq,
      seqLast: event.seq_end ?? event.seq,
      tRelS: event.t_rel_s,
      source: "signaling",
    });
  };
  return (
    <section className="kpi-timeline-section" data-testid="kpi-timeline-section">
      <RfTimeline
        projectId={projectId}
        captureId={captureId}
        selectedTime={selectedTime}
        selectedEventId={selectedEventId}
        onSelect={selectEvent}
        onTime={setSelectedTime}
        onRange={() => undefined}
        technology=""
        direction=""
        search=""
        allowedProtocols={TIMELINE_PROTOCOLS}
        stateTracksV2
        compactKpi
        persistenceId={persistenceId}
      />
    </section>
  );
}
