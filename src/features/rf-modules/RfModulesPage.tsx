// -----------------------------------------------------------------------
// 1.20.1 — RF Modules workspace, refonte UI "premium enterprise".
// Layout (A → F) :
//   A. Left module tree (280px, toujours visible, searchable)
//   B. Main header : titre, status, version, Info/Settings/Run
//   C. Compact filter bar : operator/techno/band/zone/vendor/period + Apply/Reset
//   D. Summary cards (rendues UNIQUEMENT après un Run réussi — API-driven)
//   E. Deux panneaux côte-à-côte : histogram (gauche) + map (droite)
//   F. Table des evidence sur toute la largeur
//
// Discipline (règles §12 §13 BC4) :
// - DEMO toujours labélisé (bandeau orange visible).
// - Null = N/D (jamais 0).
// - BETTER_CELL_CANDIDATE ≠ OVERSHOOTING_CONFIRMED (jamais claim confirm).
// - Pas de fake map Paris : si cell_ref.lat/lng absents → panneau unavail.
// - Operator color stripe seulement si groupé par operator (sinon accent).
// -----------------------------------------------------------------------
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  Flag,
  Info,
  MapPin,
  Maximize2,
  Play,
  Radio,
  RotateCcw,
  Search,
  Settings,
  TestTube2,
  XCircle,
} from "lucide-react";
import { useActiveProject } from "@/lib/activeProject";
import { NoActiveProject } from "@/components/bc4/NoActiveProject";
import {
  RF_MODULES,
  getModule,
  type RFAvailability,
  type RFModule,
  type RFSubview,
} from "./registry";
import {
  DEMO_BOUNDS,
  DEMO_FIXTURE_VERSION,
  RF_DEMO_FIXTURE,
  filterDemo,
  medianMargin,
  topServing,
  type DemoObservation,
} from "./fixtures/rfDemo";
import { DemoMap } from "./DemoMap";

type SubSel = { moduleId: string; subviewId: string };
type RunStatus = "idle" | "queued" | "running" | "completed" | "failed" | "cancelled";

const AVAIL_BADGE_CLASSES: Record<RFAvailability, string> = {
  AVAILABLE: "bg-sev-good/10 text-sev-good border-sev-good/30",
  PARTIAL: "bg-sev-warn/10 text-sev-warn border-sev-warn/30",
  UNVALIDATED: "bg-muted text-muted-foreground border-[#E2E8F0]",
  UNAVAILABLE: "bg-sev-bad/10 text-sev-bad border-sev-bad/30",
};

export function RfModulesPage() {
  const { activeProject } = useActiveProject();
  const [openMods, setOpenMods] = useState<Set<string>>(() => new Set(["overshooting"]));
  const [sel, setSel] = useState<SubSel>({ moduleId: "overshooting", subviewId: "detection" });
  const [sideSearch, setSideSearch] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [runId, setRunId] = useState<string | null>(null);
  const [highlightedObs, setHighlightedObs] = useState<string | null>(null);
  const [marginThreshold, setMarginThreshold] = useState<number>(3);  // Settings → candidate margin seuil
  // 1.20.2 — Mode : DEMO par défaut (fixtures). REAL = câblage back
  // (toujours labélisé différemment, pas de fallback silencieux).
  const [mode, setMode] = useState<"DEMO" | "REAL">("DEMO");

  // --- Filter bar state (shared across subviews) ------------------------
  const [filterOperator, setFilterOperator] = useState<string[]>([]);
  const [filterTechno, setFilterTechno] = useState<string[]>([]);
  const [filterBand, setFilterBand] = useState<string[]>([]);
  const [filterZone, setFilterZone] = useState<string[]>([]);
  const [filterVendor, setFilterVendor] = useState<string[]>([]);
  const [filterPeriod, setFilterPeriod] = useState<string>("30d");

  if (!activeProject) return <NoActiveProject scope="RF Modules" />;

  const activeModule = getModule(sel.moduleId)!;
  const activeSubview = activeModule.subviews.find((s) => s.id === sel.subviewId);
  const canRun = activeModule.availability_status === "AVAILABLE" || activeModule.availability_status === "PARTIAL";

  const toggleMod = (id: string) => {
    setOpenMods((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const triggerRun = () => {
    if (!canRun) {
      setRunStatus("failed");
      return;
    }
    setRunStatus("queued");
    setRunId(null);
    setTimeout(() => setRunStatus("running"), 300);
    setTimeout(() => {
      setRunStatus("completed");
      setRunId(`demo-${Date.now().toString(36)}`);
    }, 1200);
  };

  const resetFilters = () => {
    setFilterOperator([]);
    setFilterTechno([]);
    setFilterBand([]);
    setFilterZone([]);
    setFilterVendor([]);
    setFilterPeriod("30d");
  };

  const filteredModules = useMemo(() => {
    const needle = sideSearch.trim().toLowerCase();
    if (!needle) return RF_MODULES;
    return RF_MODULES.filter(
      (m) =>
        m.title.toLowerCase().includes(needle) ||
        m.subviews.some((s) => s.label.toLowerCase().includes(needle)),
    );
  }, [sideSearch]);

  return (
    <div className="flex min-h-[calc(100vh-56px)] bg-[#F5F7FB]">
      {/* ============ A. SIDEBAR MODULE TREE ============ */}
      <aside
        className="w-[280px] shrink-0 border-r border-[#E1E8F0] bg-card"
        aria-label="Arborescence des modules RF"
      >
        <div className="border-b border-[#E1E8F0] px-3 pb-2 pt-3">
          <div className="flex items-center gap-1.5">
            <Radio className="h-3.5 w-3.5 text-primary" />
            <h2 className="text-[10.5px] font-semibold uppercase tracking-wider text-foreground">
              RF Modules
            </h2>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Workspace d'analyse radio
          </p>
          <div className="relative mt-2">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <input
              value={sideSearch}
              onChange={(e) => setSideSearch(e.target.value)}
              placeholder="Rechercher un module…"
              className="h-7 w-full rounded-md border border-[#E1E8F0] bg-background pl-6 pr-2 text-[11px]"
            />
          </div>
        </div>
        <nav aria-label="Modules" className="px-1.5 py-1.5">
          {filteredModules.map((m) => {
            const open = openMods.has(m.module_id);
            const nAvail = m.subviews.filter((s) => s.available).length;
            return (
              <div key={m.module_id} className="mb-0.5">
                <button
                  onClick={() => toggleMod(m.module_id)}
                  className="group flex w-full items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left text-[12px] font-medium hover:bg-muted/60"
                  aria-expanded={open}
                >
                  {open ? (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <Flag className="h-3.5 w-3.5 text-primary" />
                  <span className="min-w-0 flex-1 truncate">{m.title}</span>
                  <span
                    className={`shrink-0 rounded border px-1 py-[1px] font-mono text-[9px] uppercase tracking-wider ${AVAIL_BADGE_CLASSES[m.availability_status]}`}
                    title={m.availability_reason}
                  >
                    {m.availability_status === "AVAILABLE" ? "OK" : m.availability_status === "PARTIAL" ? "PART" : m.availability_status === "UNVALIDATED" ? "UNV" : "UNA"}
                  </span>
                  <span className="shrink-0 font-mono text-[9.5px] tabular-nums text-muted-foreground">
                    {nAvail}/{m.subviews.length}
                  </span>
                </button>
                {open && (
                  <ul role="group" className="ml-5 border-l border-[#E1E8F0] pl-0.5">
                    {m.subviews.map((s) => {
                      const selected =
                        sel.moduleId === m.module_id && sel.subviewId === s.id;
                      return (
                        <li key={s.id}>
                          <button
                            onClick={() => s.available && setSel({ moduleId: m.module_id, subviewId: s.id })}
                            disabled={!s.available}
                            title={s.available ? s.description : s.reason_if_unavailable}
                            className={`relative flex min-h-[32px] w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[11.5px] ${
                              !s.available
                                ? "cursor-not-allowed text-muted-foreground opacity-60"
                                : selected
                                  ? "bg-[#E6F1FF] font-semibold text-primary"
                                  : "hover:bg-muted/60"
                            }`}
                          >
                            {selected && (
                              <span
                                aria-hidden
                                className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-r bg-primary"
                              />
                            )}
                            <span className="min-w-0 flex-1 truncate">{s.label}</span>
                            {!s.available && (
                              <XCircle className="h-3 w-3 shrink-0 text-sev-warn/60" />
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      {/* ============ MAIN WORKSPACE ============ */}
      <main className="min-w-0 flex-1 p-4">
        {/* ---- B. HEADER ---- */}
        <ModuleHeader
          module={activeModule}
          subview={activeSubview}
          runStatus={runStatus}
          mode={mode}
          onToggleMode={() => setMode((m) => (m === "DEMO" ? "REAL" : "DEMO"))}
          onRun={triggerRun}
          onSettings={() => setSettingsOpen(true)}
          onInfo={() => setInfoOpen(true)}
        />

        {/* ---- C. COMPACT FILTER BAR ---- */}
        <FilterBar
          operator={filterOperator} setOperator={setFilterOperator}
          techno={filterTechno} setTechno={setFilterTechno}
          band={filterBand} setBand={setFilterBand}
          zone={filterZone} setZone={setFilterZone}
          vendor={filterVendor} setVendor={setFilterVendor}
          period={filterPeriod} setPeriod={setFilterPeriod}
          onReset={resetFilters}
          disabled={runStatus === "running" || runStatus === "queued"}
        />

        {/* ---- D/E/F or UNAVAILABLE ---- */}
        <section className="mt-3 space-y-3">
          {activeModule.availability_status === "UNVALIDATED" ||
          activeModule.availability_status === "UNAVAILABLE" ? (
            <ModuleUnavailable module={activeModule} />
          ) : runStatus === "completed" && runId ? (
            <RunResults
              module={activeModule}
              subview={activeSubview}
              runId={runId}
              projectId={activeProject.id}
              mode={mode}
              marginThreshold={marginThreshold}
              highlightedObs={highlightedObs}
              setHighlightedObs={setHighlightedObs}
              filters={{ operator: filterOperator, techno: filterTechno, band: filterBand, zone: filterZone, vendor: filterVendor, period: filterPeriod }}
            />
          ) : runStatus === "running" || runStatus === "queued" ? (
            <RunInFlight status={runStatus} />
          ) : (
            <RunIdleHint module={activeModule} />
          )}
        </section>

        {settingsOpen && (
          <SettingsDialog
            module={activeModule}
            marginThreshold={marginThreshold}
            setMarginThreshold={setMarginThreshold}
            onClose={() => setSettingsOpen(false)}
          />
        )}
        {infoOpen && <InfoDrawer module={activeModule} onClose={() => setInfoOpen(false)} />}
      </main>
    </div>
  );
}

// -----------------------------------------------------------------------
// B. HEADER
// -----------------------------------------------------------------------
function ModuleHeader({
  module: m, subview, runStatus, mode, onToggleMode, onRun, onSettings, onInfo,
}: {
  module: RFModule; subview: RFSubview | undefined; runStatus: RunStatus;
  mode: "DEMO" | "REAL"; onToggleMode: () => void;
  onRun: () => void; onSettings: () => void; onInfo: () => void;
}) {
  const canRun = mode === "DEMO" || m.availability_status === "AVAILABLE" || m.availability_status === "PARTIAL";
  const running = runStatus === "running" || runStatus === "queued";
  return (
    <header className="flex items-center justify-between gap-3 rounded-md border border-[#E1E8F0] bg-card px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h1 className="text-[15px] font-semibold tracking-tight">{m.title}</h1>
          {mode === "DEMO" ? (
            <span className="rounded border border-sev-warn/40 bg-sev-warn/10 px-1.5 py-[1px] font-mono text-[10px] font-semibold uppercase tracking-wider text-sev-warn">
              MODE DÉMO
            </span>
          ) : (
            <span className="rounded border border-sev-good/40 bg-sev-good/10 px-1.5 py-[1px] font-mono text-[10px] font-semibold uppercase tracking-wider text-sev-good">
              MODE RÉEL
            </span>
          )}
          <span
            className={`rounded border px-1.5 py-[1px] font-mono text-[10px] font-semibold uppercase tracking-wider ${AVAIL_BADGE_CLASSES[m.availability_status]}`}
            title={m.availability_reason}
          >
            {m.availability_status}
          </span>
          <span className="rounded border border-[#E1E8F0] px-1.5 py-[1px] font-mono text-[10px] text-muted-foreground">
            v{m.version}
          </span>
        </div>
        <p className="mt-0.5 line-clamp-1 text-[11.5px] text-muted-foreground">
          {m.description}
          {subview ? <span className="ml-2 text-foreground/70">· Vue : {subview.label}</span> : null}
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          onClick={onToggleMode}
          title={mode === "DEMO" ? "Basculer en mode RÉEL (requêtes back)" : "Basculer en mode DÉMO (fixtures)"}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-[#E1E8F0] bg-background px-2 text-[11px] hover:bg-muted"
        >
          Mode : <strong className={mode === "DEMO" ? "text-sev-warn" : "text-sev-good"}>{mode}</strong>
        </button>
        <button
          onClick={onInfo}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-[#E1E8F0] bg-background px-2.5 text-[11.5px] hover:bg-muted"
        >
          <Info className="h-3.5 w-3.5" /> Info
        </button>
        <button
          onClick={onSettings}
          className="inline-flex h-8 items-center gap-1 rounded-md border border-[#E1E8F0] bg-background px-2.5 text-[11.5px] hover:bg-muted"
        >
          <Settings className="h-3.5 w-3.5" /> Settings
        </button>
        <button
          onClick={onRun}
          disabled={!canRun || running}
          className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-3 text-[11.5px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Play className="h-3.5 w-3.5" />
          {running ? "En cours…" : "Run"}
        </button>
      </div>
    </header>
  );
}

// -----------------------------------------------------------------------
// C. FILTER BAR
// -----------------------------------------------------------------------
function FilterBar({
  operator, setOperator,
  techno, setTechno,
  band, setBand,
  zone, setZone,
  vendor, setVendor,
  period, setPeriod,
  onReset, disabled,
}: {
  operator: string[]; setOperator: (v: string[]) => void;
  techno: string[]; setTechno: (v: string[]) => void;
  band: string[]; setBand: (v: string[]) => void;
  zone: string[]; setZone: (v: string[]) => void;
  vendor: string[]; setVendor: (v: string[]) => void;
  period: string; setPeriod: (v: string) => void;
  onReset: () => void; disabled: boolean;
}) {
  const nActive = operator.length + techno.length + band.length + zone.length + vendor.length + (period !== "30d" ? 1 : 0);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-md border border-[#E1E8F0] bg-card px-2 py-1.5">
      <span className="mr-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
        Filtres
      </span>
      <FilterChipMulti label="Opérateur" values={operator} onChange={setOperator} options={["Orange","SFR","Bouygues","Free"]} disabled={disabled} />
      <FilterChipMulti label="Techno"    values={techno}   onChange={setTechno}   options={["LTE","NR","EN-DC"]} disabled={disabled} />
      <FilterChipMulti label="Bande"     values={band}     onChange={setBand}     options={["B1","B3","B7","B20","B28","n78","n1"]} disabled={disabled} />
      <FilterChipMulti label="Zone"      values={zone}     onChange={setZone}     options={[]} disabled grayReason="Référentiel cellule géo non chargé pour ce projet" />
      <FilterChipMulti label="Vendor"    values={vendor}   onChange={setVendor}   options={[]} disabled grayReason="Vendor non prouvé par cell_ref pour les cellules observées" />
      <select
        value={period}
        onChange={(e) => setPeriod(e.target.value)}
        disabled={disabled}
        className="h-7 rounded-md border border-[#E1E8F0] bg-background px-2 text-[11px] disabled:opacity-50"
        aria-label="Période"
      >
        <option value="7d">7 derniers jours</option>
        <option value="30d">30 derniers jours</option>
        <option value="90d">90 derniers jours</option>
        <option value="all">Tout</option>
      </select>
      <div className="ml-auto flex items-center gap-1">
        {nActive > 0 && (
          <span className="text-[10.5px] text-muted-foreground">
            {nActive} filtre{nActive > 1 ? "s" : ""} actif{nActive > 1 ? "s" : ""}
          </span>
        )}
        <button
          onClick={onReset}
          disabled={disabled || nActive === 0}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-[#E1E8F0] px-2 text-[11px] hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RotateCcw className="h-3 w-3" /> Reset
        </button>
      </div>
    </div>
  );
}

function FilterChipMulti({
  label, values, onChange, options, disabled, grayReason,
}: {
  label: string; values: string[]; onChange: (v: string[]) => void;
  options: readonly string[]; disabled?: boolean; grayReason?: string;
}) {
  const [open, setOpen] = useState(false);
  const nSel = values.length;
  const activeCls = nSel > 0 ? "border-primary/50 bg-primary/5 text-primary" : "border-[#E1E8F0] bg-background";
  if (disabled && options.length === 0) {
    return (
      <span
        title={grayReason ?? `${label} indisponible`}
        className="inline-flex h-7 cursor-not-allowed items-center gap-1 rounded-md border border-dashed border-[#E1E8F0] bg-muted/30 px-2 text-[11px] text-muted-foreground opacity-70"
      >
        {label}
      </span>
    );
  }
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] hover:bg-muted ${activeCls}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{label}</span>
        <span className="font-mono tabular-nums">{nSel === 0 ? "Tous" : nSel === 1 ? values[0] : `${nSel} sél.`}</span>
      </button>
      {open && (
        <div className="absolute left-0 top-8 z-20 w-44 rounded-md border border-[#E1E8F0] bg-popover p-1 shadow-md">
          <ul className="max-h-48 overflow-auto">
            {options.map((o) => {
              const sel = values.includes(o);
              return (
                <li key={o}>
                  <button
                    onClick={() => onChange(sel ? values.filter((v) => v !== o) : [...values, o])}
                    className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-[11px] hover:bg-muted"
                  >
                    <span>{o}</span>
                    {sel && <CheckCircle2 className="h-3 w-3 text-primary" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------
// D. SUMMARY CARDS + E. HISTO/MAP + F. EVIDENCE TABLE
// -----------------------------------------------------------------------
function RunResults({
  module: m, subview, runId, projectId, mode, marginThreshold, highlightedObs, setHighlightedObs, filters,
}: {
  module: RFModule; subview: RFSubview | undefined; runId: string; projectId: string;
  mode: "DEMO" | "REAL"; marginThreshold: number;
  highlightedObs: string | null; setHighlightedObs: (id: string | null) => void;
  filters: { operator: string[]; techno: string[]; band: string[]; zone: string[]; vendor: string[]; period: string };
}) {
  // 1.20.2 — DEMO : lit RF_DEMO_FIXTURE (déterministe, isolé). REAL :
  // câblage back (futur). Jamais mélanger les 2 modes dans les totaux.
  if (mode === "REAL") {
    return <RealModeUnavailable module={m} />;
  }

  // Overshooting : fixture complet. Autres modules : "aperçu démo non implémenté"
  if (m.module_id !== "overshooting") {
    return <DemoPreviewNotImplemented module={m} />;
  }

  // Filtrage DEMO + classification suivant marginThreshold Settings.
  const filtered: DemoObservation[] = useMemo(() => {
    return filterDemo(RF_DEMO_FIXTURE, filters).map((o) => {
      // Reclassifie en fonction du seuil Settings (règle §G5)
      const candEvid = o.margin_db >= marginThreshold;
      const classification = o.confirmation_evidence && o.margin_db >= 10
        ? "OVERSHOOTING_CONFIRMED" as const
        : candEvid
          ? "BETTER_CELL_CANDIDATE" as const
          : "INSUFFICIENT_EVIDENCE" as const;
      return { ...o, candidate_evidence: candEvid, classification };
    });
  }, [filters, marginThreshold]);

  const histo = useMemo(() => topServing(filtered, 10), [filtered]);
  const med = medianMargin(filtered);
  const nCandidate = filtered.filter((o) => o.classification === "BETTER_CELL_CANDIDATE").length;
  const nConfirmed = filtered.filter((o) => o.classification === "OVERSHOOTING_CONFIRMED").length;
  const nServing = new Set(filtered.map((o) => o.serving_cell)).size;
  const nZones = new Set(filtered.map((o) => o.zone)).size;

  return (
    <>
      {/* Provenance row */}
      <div className="flex items-center gap-2 rounded-md border border-sev-warn/40 bg-sev-warn/5 px-3 py-1.5 text-[11px] text-sev-warn">
        <TestTube2 className="h-3.5 w-3.5" />
        <span>
          <strong>MODE DÉMO — Données fictives</strong> · fixture <code className="font-mono">{DEMO_FIXTURE_VERSION}</code> · toute conclusion ci-dessous est illustrative, pas une observation réseau réelle.
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10.5px] text-muted-foreground">
        <span>run_id : <span className="font-mono text-foreground">{runId}</span></span>
        <span>project_id : <span className="font-mono text-foreground">{projectId}</span></span>
        <span>module : <span className="font-mono text-foreground">{m.module_id}@{m.version}</span></span>
        <span>vue : <span className="font-mono text-foreground">{subview?.id ?? "—"}</span></span>
        <span>n obs : <span className="font-mono text-foreground">{filtered.length}</span></span>
        <span>margin ≥ : <span className="font-mono text-foreground">{marginThreshold} dB</span></span>
        <span className="text-sev-warn">origine : <strong>DEMO</strong></span>
      </div>

      {/* D. SUMMARY CARDS — dérivés du fixture filtré uniquement */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryCard label="Candidats BETTER_CELL" value={nCandidate} hint="n observations ≥ seuil marge" color="warn" />
        <SummaryCard label="Cellules serveuses impactées" value={nServing} hint="distinct(serving_cell)" />
        <SummaryCard label="Marge RSRP médiane" value={med !== null ? `+${med} dB` : "N/D"} hint="p50 sur obs filtrées" />
        <SummaryCard label="Overshooting confirmés" value={nConfirmed} hint="Confirmation evidence active" color={nConfirmed > 0 ? "bad" : "muted"} />
      </div>

      {/* E. TWO PANELS SIDE-BY-SIDE : histogram + map */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <HistogramPanel
          data={histo}
          highlightedServing={highlightedObs ? filtered.find((o) => o.obs_id === highlightedObs)?.serving_cell ?? null : null}
          onBarClick={(serving) => {
            const first = filtered.find((o) => o.serving_cell === serving);
            setHighlightedObs(first ? first.obs_id : null);
          }}
        />
        <div className="rounded-md border border-[#E1E8F0] bg-card">
          <div className="flex items-center justify-between border-b border-[#E1E8F0] px-3 py-2">
            <div>
              <h3 className="text-[12px] font-semibold">Distribution géographique (DÉMO)</h3>
              <p className="text-[10.5px] text-muted-foreground">
                {filtered.length} observations fictives · zone de démo · <strong className="text-sev-warn">pas un vrai site opérateur</strong>
              </p>
            </div>
          </div>
          <div className="p-2">
            <DemoMap
              observations={filtered}
              bounds={DEMO_BOUNDS}
              highlightedObsId={highlightedObs}
              onObsClick={(id) => setHighlightedObs(id === highlightedObs ? null : id)}
            />
          </div>
        </div>
      </div>

      {/* F. EVIDENCE TABLE */}
      <EvidenceTable
        rows={filtered}
        highlightedObsId={highlightedObs}
        onRowClick={(id) => setHighlightedObs(id === highlightedObs ? null : id)}
      />
    </>
  );
}

function SummaryCard({ label, value, hint, color = "default" }: { label: string; value: number | string; hint: string; color?: "default" | "warn" | "bad" | "muted" }) {
  const cls = color === "warn" ? "text-sev-warn" : color === "bad" ? "text-sev-bad" : color === "muted" ? "text-muted-foreground" : "text-foreground";
  return (
    <div className="rounded-md border border-[#E1E8F0] bg-card px-3 py-2">
      <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-[20px] font-semibold tabular-nums ${cls}`}>{value}</p>
      <p className="mt-0.5 text-[10.5px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function RealModeUnavailable({ module: m }: { module: RFModule }) {
  return (
    <div className="rounded-md border border-sev-good/40 bg-sev-good/5 p-4 text-[11.5px]">
      <div className="flex items-start gap-2">
        <CheckCircle2 className="mt-0.5 h-4 w-4 text-sev-good shrink-0" />
        <div>
          <p className="font-semibold text-sev-good">MODE RÉEL — câblage back requis</p>
          <p className="mt-1 text-muted-foreground">
            Le résultat réel pour <strong className="text-foreground">{m.title}</strong> sera servi par
            <code className="mx-1 font-mono">POST /projects/&lcub;id&rcub;/rf/modules/{m.module_id}/runs</code>.
            Pour l'instant, bascule en <strong>MODE DÉMO</strong> pour prévisualiser le contrat de rendu avec le fixture.
          </p>
          <p className="mt-2 text-muted-foreground">
            Statut back actuel : <span className={`font-semibold ${AVAIL_BADGE_CLASSES[m.availability_status]}`.split(" ")[0]}>{m.availability_status}</span>
            — {m.availability_reason}
          </p>
        </div>
      </div>
    </div>
  );
}

function DemoPreviewNotImplemented({ module: m }: { module: RFModule }) {
  return (
    <div className="rounded-md border border-dashed border-sev-warn/40 bg-card p-6 text-center text-[12px]">
      <p className="font-semibold text-sev-warn">Aperçu démo non implémenté</p>
      <p className="mt-1 text-muted-foreground">
        Le module <strong className="text-foreground">{m.title}</strong> n'a pas encore de fixture DÉMO
        dédié. Priorité du lot 1.20.2 : Overshooting Detection. Les autres modules affichent leur statut
        et leurs sous-vues réelles.
      </p>
    </div>
  );
}

function HistogramPanel({
  data, highlightedServing, onBarClick,
}: {
  data: Array<{ serving: string; count: number }>;
  highlightedServing: string | null;
  onBarClick: (serving: string) => void;
}) {
  const maxN = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="rounded-md border border-[#E1E8F0] bg-card">
      <div className="flex items-center justify-between border-b border-[#E1E8F0] px-3 py-2">
        <div>
          <h3 className="text-[12px] font-semibold">Top 10 cellules serveuses par n observations</h3>
          <p className="text-[10.5px] text-muted-foreground">
            Barres : nombre d'observations BETTER_CELL (axe x). Cliquer → highlight carte + table.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-muted" title="Export PNG (DEMO)">
            <Download className="h-3 w-3" />
          </button>
          <button className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-muted" title="Plein écran">
            <Maximize2 className="h-3 w-3" />
          </button>
        </div>
      </div>
      <div className="space-y-1.5 p-3">
        {data.length === 0 ? (
          <p className="py-6 text-center text-[11px] text-muted-foreground">Aucune donnée pour ces filtres.</p>
        ) : data.map((d) => {
          const pct = (100 * d.count) / maxN;
          const hl = d.serving === highlightedServing;
          return (
            <button
              key={d.serving}
              onClick={() => onBarClick(d.serving)}
              className={`block w-full rounded px-1 py-0.5 text-left transition-colors ${hl ? "bg-primary/5 ring-1 ring-primary/40" : "hover:bg-muted/40"}`}
              title={`${d.serving} : ${d.count} observations · cliquer pour synchroniser carte & table`}
            >
              <div className="flex items-center justify-between text-[11px]">
                <span className="truncate font-mono">{d.serving}</span>
                <span className="font-mono tabular-nums text-muted-foreground">{d.count}</span>
              </div>
              <div className="mt-0.5 h-3 w-full overflow-hidden rounded bg-muted/40">
                <div
                  className={`h-full ${hl ? "bg-primary" : "bg-sev-warn/80"} transition-all`}
                  style={{ width: `${pct}%` }}
                  role="progressbar"
                  aria-valuenow={d.count}
                  aria-valuemin={0}
                  aria-valuemax={maxN}
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const CLASSIFICATION_CLS: Record<DemoObservation["classification"], string> = {
  OVERSHOOTING_CONFIRMED: "text-sev-bad",
  BETTER_CELL_CANDIDATE: "text-sev-warn",
  INSUFFICIENT_EVIDENCE: "text-muted-foreground",
};

function EvidenceTable({
  rows, highlightedObsId, onRowClick,
}: {
  rows: readonly DemoObservation[];
  highlightedObsId: string | null;
  onRowClick: (obsId: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-[#E1E8F0] bg-card p-6 text-center text-[11px] text-muted-foreground">
        Aucune observation pour ces filtres.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-md border border-[#E1E8F0] bg-card">
      <div className="flex items-center justify-between border-b border-[#E1E8F0] px-3 py-2">
        <h3 className="text-[12px] font-semibold">Table des evidence ({rows.length} obs)</h3>
        <button className="inline-flex h-6 items-center gap-1 rounded border border-[#E1E8F0] px-2 text-[10.5px] hover:bg-muted" title="Export CSV (inclut marker DEMO + filtres + fixture version)">
          <Download className="h-3 w-3" /> CSV
        </button>
      </div>
      <table className="w-full text-[11px]">
        <thead className="sticky top-0 border-b border-[#E1E8F0] bg-muted/50 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-3 py-1.5">obs_id</th>
            <th className="px-3 py-1.5">capture_id</th>
            <th className="px-3 py-1.5 text-right">seq</th>
            <th className="px-3 py-1.5">serving</th>
            <th className="px-3 py-1.5 text-right">RSRP serv.</th>
            <th className="px-3 py-1.5">candidate</th>
            <th className="px-3 py-1.5 text-right">RSRP cand.</th>
            <th className="px-3 py-1.5 text-right">margin</th>
            <th className="px-3 py-1.5">band</th>
            <th className="px-3 py-1.5">operator</th>
            <th className="px-3 py-1.5">vendor</th>
            <th className="px-3 py-1.5">zone</th>
            <th className="px-3 py-1.5">classification</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const hl = r.obs_id === highlightedObsId;
            return (
              <tr
                key={r.obs_id}
                onClick={() => onRowClick(r.obs_id)}
                className={`cursor-pointer border-t border-[#E1E8F0] ${hl ? "bg-primary/5" : "hover:bg-muted/40"}`}
              >
                <td className="px-3 py-1.5 font-mono text-[10.5px]">{r.obs_id}</td>
                <td className="px-3 py-1.5 font-mono text-[10.5px]">{r.capture_id}</td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums">{r.seq}</td>
                <td className="px-3 py-1.5 font-mono text-[10.5px]">{r.serving_cell}</td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums">{r.serving_rsrp_dbm}</td>
                <td className="px-3 py-1.5 font-mono text-[10.5px]">{r.candidate_cell}</td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums">{r.candidate_rsrp_dbm}</td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums text-sev-warn">+{r.margin_db}</td>
                <td className="px-3 py-1.5 font-mono text-[10.5px]">{r.band}</td>
                <td className="px-3 py-1.5">{r.operator}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{r.vendor}</td>
                <td className="px-3 py-1.5 text-[10.5px] text-muted-foreground">{r.zone}</td>
                <td className={`px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider ${CLASSIFICATION_CLS[r.classification]}`}>
                  {r.classification}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// -----------------------------------------------------------------------
// UNAVAILABLE / IDLE / INFLIGHT / SETTINGS / INFO (inchangés 1.20.0 -
// mêmes composants, affinés visuellement)
// -----------------------------------------------------------------------
function ModuleUnavailable({ module: m }: { module: RFModule }) {
  return (
    <div className="rounded-md border border-sev-warn/40 bg-sev-warn/5 p-4 text-[11.5px]">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 text-sev-warn shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sev-warn">
            Module non exécutable sur ce projet — {m.availability_status}
          </p>
          <p className="mt-1 text-muted-foreground">{m.availability_reason}</p>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <p className="font-semibold text-foreground">Sources requises</p>
              <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                {m.required_sources.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
            <div>
              <p className="font-semibold text-foreground">Champs requis</p>
              <ul className="mt-1 list-disc pl-4 font-mono text-[11px] text-muted-foreground">
                {m.required_fields.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RunIdleHint({ module: m }: { module: RFModule }) {
  return (
    <div className="rounded-md border border-dashed border-[#E1E8F0] bg-card p-6 text-center text-[11.5px] text-muted-foreground">
      <p>
        Prêt à exécuter <strong className="text-foreground">{m.title}</strong>. Choisis tes filtres puis clique <strong className="text-primary">Run</strong>.
      </p>
    </div>
  );
}

function RunInFlight({ status }: { status: RunStatus }) {
  return (
    <div className="rounded-md border border-[#E1E8F0] bg-card p-6 text-center text-[11.5px]">
      <p className="font-semibold">{status === "queued" ? "En file d'attente…" : "Exécution en cours…"}</p>
      <p className="mt-1 text-muted-foreground">Validation des sources + filtres · soumission du job · lecture du résultat.</p>
    </div>
  );
}

function SettingsDialog({
  module: m, marginThreshold, setMarginThreshold, onClose,
}: {
  module: RFModule; marginThreshold: number; setMarginThreshold: (n: number) => void; onClose: () => void;
}) {
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-md border bg-card p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">{m.title} — Settings v{m.version}</h3>
          <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">Fermer</button>
        </div>
        <ul className="space-y-3">
          {m.settings_schema.map((f) => {
            // 1.20.2 — Pour Overshooting, le seuil margin_db est live-wired
            // dans le state parent → re-run reclassifie les lignes selon §G5.
            const isMargin = m.module_id === "overshooting" && f.key === "margin_db";
            return (
              <li key={f.key}>
                <label className="text-xs font-medium">
                  {f.label} {f.unit && <span className="text-muted-foreground">({f.unit})</span>}
                </label>
                <div className="mt-1">
                  <input
                    type={f.type === "number" ? "number" : "text"}
                    value={isMargin ? marginThreshold : undefined}
                    defaultValue={isMargin ? undefined : String(f.default)}
                    onChange={isMargin ? (e) => {
                      const n = Number(e.target.value);
                      if (!Number.isNaN(n)) setMarginThreshold(n);
                    } : undefined}
                    min={f.min}
                    max={f.max}
                    className="h-8 w-32 rounded border bg-background px-2 text-xs"
                  />
                </div>
                <p className="mt-1 text-[10.5px] text-muted-foreground">{f.description}</p>
                {isMargin && (
                  <p className="mt-1 text-[10px] text-primary">
                    ↳ Appliqué immédiatement aux résultats DEMO : les observations avec margin ≥ {marginThreshold} dB sont marquées BETTER_CELL_CANDIDATE.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-4 text-[10.5px] text-muted-foreground">
          En mode RÉEL : les valeurs seraient persistées via <code>PUT /rf/modules/{m.module_id}/settings</code>.
        </p>
      </div>
    </div>
  );
}

function InfoDrawer({ module: m, onClose }: { module: RFModule; onClose: () => void }) {
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto border-l bg-card p-4 shadow-xl">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{m.title} — Méthodologie</h3>
        <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">Fermer</button>
      </div>
      <section className="space-y-3 text-xs">
        <div><p className="font-semibold">Description</p><p className="text-muted-foreground">{m.description}</p></div>
        <div><p className="font-semibold">Capacités</p>
          <ul className="list-disc pl-4 font-mono text-[11px] text-muted-foreground">
            {m.capabilities.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </div>
        <div><p className="font-semibold">Sources requises</p>
          <ul className="list-disc pl-4 text-muted-foreground">
            {m.required_sources.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
        <div><p className="font-semibold">Champs requis</p>
          <ul className="list-disc pl-4 font-mono text-[11px] text-muted-foreground">
            {m.required_fields.map((f, i) => <li key={i}>{f}</li>)}
          </ul>
        </div>
        <div><p className="font-semibold">Dimensions supportées</p>
          <p className="font-mono text-[11px] text-muted-foreground">{m.supported_dimensions.join(" · ")}</p>
        </div>
        <div><p className="font-semibold">Statut</p>
          <p className={`font-mono text-[11px] ${AVAIL_BADGE_CLASSES[m.availability_status]}`.replace("bg-","text-").split(" ")[0]}>{m.availability_status}</p>
          <p className="mt-1 text-muted-foreground">{m.availability_reason}</p>
        </div>
      </section>
    </div>
  );
}
