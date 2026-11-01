/** Compact vertical RF card for the selected drive measurement point.
 * Replaces the old wide map popup on the Map workspace: only real, available
 * values are rendered — missing data leaves the row out entirely. */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import type { MeasurementPointDetails, RadioCellLink } from "./measurement-point-popup";

function formatDistance(m?: number | null): string | null {
  if (m == null || !Number.isFinite(m)) return null;
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2)} km`;
}

function TechBadge({ label }: { label: string }) {
  return (
    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
      {label}
    </span>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <strong className="tabular-nums">{value}</strong>
    </div>
  );
}

function ConfidenceBadge({ link }: { link: RadioCellLink }) {
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

export function SelectedPointCard({
  details,
  onClose,
}: {
  details: MeasurementPointDetails;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const rsrp =
    typeof details.value === "number" && Number.isFinite(details.value) ? details.value : null;
  const serving = details.serving;
  const anchor = details.nrAnchor;
  const servingDistance = formatDistance(serving?.distanceM);

  return (
    <article
      data-testid="selected-point-card"
      className="w-full rounded-xl border border-border/70 bg-card/95 text-[11px] shadow-lg backdrop-blur-md"
    >
      <header className="flex items-center justify-between gap-2 border-b px-3 py-1.5">
        <strong className="text-xs">{t("mapWorkspace.selectedPoint")}</strong>
        <span className="flex items-center gap-0.5">
          <button
            type="button"
            aria-label={collapsed ? t("mapWorkspace.expandCard") : t("mapWorkspace.collapseCard")}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((c) => !c)}
            className="rounded p-1 hover:bg-muted"
          >
            {collapsed ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronUp className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            aria-label={t("mapWorkspace.closeCard")}
            onClick={onClose}
            className="rounded p-1 hover:bg-muted"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      </header>
      {!collapsed && (
        <div className="space-y-2 px-3 py-2">
          <section>
            <div className="mb-1 flex items-center justify-between">
              <span className="font-semibold">{t("mapWorkspace.radio")}</span>
              <TechBadge label="LTE" />
            </div>
            {rsrp !== null && <Row label="RSRP" value={`${rsrp} dBm`} />}
          </section>
          {serving && (
            <section className="border-t pt-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="font-semibold">{t("mapPointPopup.serving")}</span>
                <span className="flex items-center gap-1">
                  <TechBadge label="LTE" />
                  <ConfidenceBadge link={serving} />
                </span>
              </div>
              {serving.pci != null && <Row label="PCI" value={String(serving.pci)} />}
              {servingDistance && (
                <Row label={t("mapWorkspace.distanceUeSite")} value={servingDistance} />
              )}
            </section>
          )}
          {anchor && anchor.pci != null && (
            <section className="border-t pt-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-semibold">{t("mapPointPopup.nrAnchor")}</span>
                <TechBadge label="NR" />
              </div>
              <Row label="PCI" value={String(anchor.pci)} />
            </section>
          )}
        </div>
      )}
    </article>
  );
}
