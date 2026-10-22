import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  FileText,
  Filter,
  Layers,
  MailCheck,
  Network,
  Radio,
  RotateCcw,
  Search,
  Table2,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { MessageFilterPopover, MessageLayerBadge } from "./MessageFilterPopover";
import type { MessageSelection, MessageType } from "./message-filter";

function FilterSection({
  icon: Icon,
  title,
  children,
  subtitle,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  subtitle?: string;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section className="sig-filter-section">
      <Button
        variant="ghost"
        className="sig-filter-heading"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <Icon aria-hidden="true" />
        <span>{title}</span>
        <ChevronDown className={open ? "" : "-rotate-90"} aria-hidden="true" />
      </Button>
      {open && (
        <div className="sig-filter-control">
          {subtitle && <p className="sig-filter-subtitle">{subtitle}</p>}
          {children}
        </div>
      )}
    </section>
  );
}

export function SignalingFilters(props: {
  layers: string[];
  protocols: string[];
  technology: string;
  direction: string;
  search: string;
  procedure: string;
  capture?: string | undefined;
  size: number;
  // 1.92.0 — kind back 0.76.1 : 'ue'|'scanner'|null. Badge "Scanner" affiché
  // dans l'option si kind='scanner'.
  captures: { capture_id: string; label: string; kind?: "ue" | "scanner" | null | undefined }[];
  procedures: { id: string; type: string; seq_start: number; seq_end: number | null }[];
  counts?: Record<string, number> | undefined;
  total?: number | undefined;
  selection: MessageSelection;
  types: MessageType[];
  catalogLoading: boolean;
  catalogError: boolean;
  onRequestTypes: () => void;
  onApply: (v: MessageSelection) => void;
  onTechnology: (v: string) => void;
  onProtocols: (v: string[]) => void;
  onDirection: (v: string) => void;
  onCapture: (v: string) => void;
  onProcedure: (v: string) => void;
  onSearch: (v: string) => void;
  onSize: (v: number) => void;
  onReset: () => void;
  onCollapse: () => void;
  viewControls?: ReactNode;

}) {
  const { t } = useTranslation();
  return (
    <aside className="signaling-pane sig-filters" data-testid="signaling-sidebar">
      <header className="sig-filters-header">
        <span className="sig-filter-icon">
          <Filter size={22} />
        </span>
        <h2>{t("sigFilters.title")}</h2>
        <Button variant="ghost" size="sm" onClick={props.onReset} title={t("sigFilters.reset")}>
          <RotateCcw />
          <span>{t("sigFilters.reset")}</span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={props.onCollapse}
          aria-label={t("sigFilters.collapse")}
        >
          <ChevronLeft />
        </Button>
        <p>
          {props.total == null
            ? t("sigFilters.pending")
            : t("sigFilters.total", { count: props.total })}
        </p>
        {props.viewControls && (
          <div className="sig-filters-view" data-testid="signaling-view-controls">
            {props.viewControls}
          </div>
        )}

      </header>
      <div className="sig-filters-sections">
        <FilterSection icon={Radio} title={t("sigFilters.technology")}>
          <select
            aria-label={t("sigFilters.technology")}
            value={props.technology}
            onChange={(e) => props.onTechnology(e.target.value)}
          >
            <option value="">{t("sigFilters.allTechnologies")}</option>
            <option value="LTE">LTE</option>
            <option value="NR">NR</option>
          </select>
        </FilterSection>
        <FilterSection icon={Layers} title={t("sigFilters.layers")}>
          <div className="sig-filter-layers">
            {props.layers.map((layer) => (
              <label key={layer}>
                <Checkbox
                  checked={props.protocols.includes(layer)}
                  aria-label={layer}
                  onCheckedChange={(v) =>
                    props.onProtocols(
                      v === true
                        ? [...props.protocols, layer]
                        : props.protocols.filter((p) => p !== layer),
                    )
                  }
                />
                <MessageLayerBadge protocol={layer} />
                <span className="min-w-0 truncate">
                  {layer === "Événements Nemo" ? t("sigFilters.nemo") : layer}
                </span>
                <span className="sig-occurrence">
                  {props.counts?.[layer] == null ? "—" : props.counts[layer].toLocaleString()}
                </span>
              </label>
            ))}
          </div>
        </FilterSection>
        <FilterSection
          icon={MailCheck}
          title={t("sigFilters.messages")}
          subtitle={t("sigFilters.messageSubtitle")}
        >
          <MessageFilterPopover
            types={props.types}
            selection={props.selection}
            onApply={props.onApply}
            onRequest={props.onRequestTypes}
            loading={props.catalogLoading}
            error={props.catalogError}
            disabled={!props.capture}
          />
        </FilterSection>
        <FilterSection icon={ArrowLeftRight} title={t("sigFilters.direction")}>
          <div className="sig-filter-directions">
            {[
              { value: "", icon: ArrowLeftRight, label: t("sigFilters.allDirections") },
              { value: "UL", icon: ArrowUp, label: "UL" },
              { value: "DL", icon: ArrowDown, label: "DL" },
            ].map(({ value, icon: Icon, label }) => (
              <Button
                key={value}
                variant={props.direction === value ? "default" : "outline"}
                size="sm"
                aria-pressed={props.direction === value}
                onClick={() => props.onDirection(value)}
              >
                <Icon />
                {label}
              </Button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 h-6 text-xs text-muted-foreground"
            aria-pressed={props.direction === "unknown"}
            onClick={() => props.onDirection(props.direction === "unknown" ? "" : "unknown")}
          >
            {t("sigTable.undocumented")}
          </Button>
        </FilterSection>
        <FilterSection icon={FileText} title={t("sigFilters.capture")}>
          <select
            aria-label={t("sigFilters.capture")}
            value={props.capture ?? ""}
            onChange={(e) => props.onCapture(e.target.value)}
          >
            {props.captures.map((c) => (
              <option key={c.capture_id} value={c.capture_id}>
                {c.kind === "scanner" ? "[Scanner] " : ""}{c.label}
              </option>
            ))}
          </select>
        </FilterSection>
        <FilterSection icon={Network} title={t("sigFilters.procedure")}>
          <select
            aria-label={t("sigFilters.procedure")}
            value={props.procedure}
            onChange={(e) => props.onProcedure(e.target.value)}
          >
            <option value="">
              {t("sigFilters.allProcedures", { count: props.procedures.length })}
            </option>
            {props.procedures.map((p) => (
              <option key={p.id} value={p.id}>
                {p.type} · {p.seq_start}
                {p.seq_end == null ? "" : ` → ${p.seq_end}`}
              </option>
            ))}
          </select>
        </FilterSection>
        <FilterSection
          icon={Search}
          title={t("sigFilters.search")}
          subtitle={t("sigFilters.searchScope")}
        >
          <label className="sig-search">
            <Search size={14} />
            <input
              aria-label={t("sigFilters.search")}
              placeholder={t("sigFilters.searchPlaceholder")}
              value={props.search}
              onChange={(e) => props.onSearch(e.target.value)}
            />
          </label>
        </FilterSection>
        <FilterSection icon={Table2} title={t("sigFilters.pageSize")}>
          <div className="sig-filter-sizes">
            {[50, 100, 200, 500, 1000].map((n) => (
              <Button
                key={n}
                variant={props.size === n ? "default" : "outline"}
                size="sm"
                aria-pressed={props.size === n}
                onClick={() => props.onSize(n)}
              >
                {n.toLocaleString()}
              </Button>
            ))}
          </div>
        </FilterSection>
      </div>
    </aside>
  );
}
