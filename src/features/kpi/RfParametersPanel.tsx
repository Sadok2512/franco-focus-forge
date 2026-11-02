/** RF Parameters tab content for the selected drive measurement point.
 * Only API-published values are shown: absent fields read "N/D" (identity
 * rows) or are omitted (measurements), never zero or inferred. CA, bandwidth
 * and NR anchoring are never deduced from multiple frequency measurements. */
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import type { MeasurementPointDetails, RadioCellLink } from "./measurement-point-popup";
import { bearingDeg, type RfPointMetric } from "./map-rf-panel";

const ND = "N/D";
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const text = (v: unknown) => (v === null || v === undefined || v === "" ? ND : String(v));

export function formatElapsed(value?: number | null): string {
  if (!finite(value)) return ND;
  const h = Math.floor(value / 3600);
  const m = Math.floor((value % 3600) / 60);
  const s = value % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${s.toFixed(3).padStart(6, "0")}`;
}

function formatDistance(m?: number | null): string {
  if (!finite(m)) return ND;
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2)} km`;
}

/** RSRP colour classes only where the value is meaningful. */
function rsrpTone(v: number): string {
  if (v >= -90) return "text-emerald-600 dark:text-emerald-400";
  if (v >= -105) return "text-amber-600 dark:text-amber-400";
  return "text-destructive";
}

function Badge({ children, tone = "primary" }: { children: ReactNode; tone?: "primary" | "nr" }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
        tone === "nr" ? "bg-violet-500/10 text-violet-600 dark:text-violet-400" : "bg-primary/10 text-primary"
      }`}
    >
      {children}
    </span>
  );
}

function Row({ label, value, className = "", highlight = false }: {
  label: string;
  value: ReactNode;
  className?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`grid grid-cols-[minmax(0,44%)_minmax(0,1fr)] items-baseline gap-2 rounded px-1 ${highlight ? "bg-primary/10" : ""}`}
    >
      <span className="truncate text-muted-foreground" title={label}>
        {label}
      </span>
      <strong
        className={`min-w-0 break-words font-medium tabular-nums ${className}`}
        title={typeof value === "string" ? value : undefined}
      >
        {value}
      </strong>
    </div>
  );
}

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="border-b border-border/60 pb-2 last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 py-1 text-left text-xs font-semibold"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {title}
          {aside}
        </span>
        {open ? <ChevronUp className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
      </button>
      {open && <div className="space-y-0.5">{children}</div>}
    </section>
  );
}

function Confidence({ link }: { link: RadioCellLink }) {
  const { t } = useTranslation();
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
        link.confidence === "proven"
          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
      }`}
    >
      {t(`mapPointPopup.confidence.${link.confidence}`)}
    </span>
  );
}

export function RfParametersPanel({
  details,
  position,
  metrics = [],
  onClose,
}: {
  details: MeasurementPointDetails;
  /** UE position [lng, lat] of the selected point. */
  position?: [number, number] | undefined;
  /** Metrics the host map holds for this exact sequence. */
  metrics?: RfPointMetric[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const rsrp = finite(details.value) ? details.value : null;
  const serving = details.serving;
  const anchor = details.nrAnchor;
  const tech = anchor ? "LTE+NR" : "LTE";
  const azimuth =
    serving && position && finite(serving.lat) && finite(serving.lng)
      ? `${Math.round(bearingDeg(position, [serving.lng, serving.lat]))}°`
      : ND;

  return (
    <article data-testid="rf-parameters-panel" className="space-y-1 text-[12px]">
      <div className="flex items-center justify-end">
        <button
          type="button"
          aria-label={t("mapWorkspace.closeCard")}
          title={t("mapWorkspace.closeCard")}
          onClick={onClose}
          className="rounded p-1 hover:bg-muted"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <Section title={t("mapWorkspace.selectedPoint")}>
        <Row label={t("mapWorkspace.rf.time")} value={formatElapsed(details.tRelS)} />
        <Row
          label={t("mapWorkspace.rf.position")}
          value={position ? `${position[1].toFixed(6)}, ${position[0].toFixed(6)}` : ND}
        />
        <Row label={t("mapWorkspace.rf.eventId")} value={`#${details.seq}`} />
      </Section>

      {anchor && (
        <Section title={t("mapWorkspace.rf.radioInfo")}>
          <Row label={t("mapWorkspace.rf.technology")} value={<Badge>{tech}</Badge>} />
          <Row
            label="NR"
            value={<Badge tone="nr">{t("mapPointPopup.nrAnchor")}</Badge>}
          />
          <Row label="NR PCI" value={text(anchor.pci)} />
          <Row label="NRARFCN" value={text(anchor.arfcn)} />
        </Section>
      )}

      {serving && (
        <Section
          title={t("mapPointPopup.serving")}
          aside={<Confidence link={serving} />}
        >
          <Row label={t("mapWorkspace.rf.servingTech")} value={<Badge>LTE PCell</Badge>} />
          <Row label="PCI" value={text(serving.pci)} />
          <Row label="EARFCN" value={text(serving.arfcn)} />
          <Row label={t("mapWorkspace.rf.site")} value={text(serving.siteName)} />
          <Row
            label={t("mapWorkspace.distanceUeSite")}
            value={formatDistance(serving.distanceM)}
            className="text-primary"
          />
          <Row label={t("mapWorkspace.rf.azimuth")} value={azimuth} />
          {details.neighbours.length > 0 && (
            <Row label={t("mapWorkspace.rf.neighbours")} value={String(details.neighbours.length)} />
          )}
        </Section>
      )}

      {rsrp !== null && (
        <Section title={t("mapWorkspace.rf.measurements")}>
          <Row label="RSRP" value={`${rsrp.toFixed(2)} dBm`} className={rsrpTone(rsrp)} />
        </Section>
      )}

      <Section title={t("mapWorkspace.rf.metrics")}>
        {metrics.length ? (
          metrics.map((m) => (
            <Row
              key={m.label}
              label={m.label}
              highlight={m.active === true}
              value={
                m.value === null || m.value === undefined || m.value === ""
                  ? ND
                  : `${m.value}${m.unit ? ` ${m.unit}` : ""}`
              }
            />
          ))
        ) : (
          <p className="text-muted-foreground">{t("mapWorkspace.rf.noMetrics")}</p>
        )}
      </Section>
    </article>
  );
}
