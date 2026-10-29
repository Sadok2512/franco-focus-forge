import {
  kpiCatalogQuery,
  kpiFiltersQuery,
  metricsCatalogQuery,
  analyticsProjectQuery,
} from "@/lib/analytics-bootstrap";
import { useTranslation } from "react-i18next";
import { useCaptureContext } from "@/lib/capture-context";
import { VisualizationItems } from "./VisualizationMenu";
import { defaultConfig, type ChartConfig, type VisualizationType } from "./visualization-model";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  BarChart3,
  Download,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { getProjectKpi } from "@/lib/api/client";
import { useActiveProject } from "@/lib/activeProject";
import { useFilters } from "@/lib/filters";
import { NoActiveProject } from "@/components/bc4/NoActiveProject";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import type {
  KpiGroupBy,
  ProjectKpiCatalog,
  ProjectKpiFilters,
} from "@/lib/api/project-kpi-schemas";
import { KpiCatalogSidebar } from "./KpiCatalogSidebar";
import { TableSettingsWorkspaceContext } from "./table-settings";
import { MetricsWorkspace, type View as MetricsView } from "./MetricsWorkspace";
import { MetricsCatalogSidebar } from "./MetricsCatalogSidebar";
import { getMetricCaptures } from "@/lib/api/client";
import { API_LEAN_STALE_MS, metricCapturesKey } from "./query-keys";
import type { MetricView } from "./MetricGraphCard";
import { readMetricViews, writeMetricViews, type MetricViews } from "./metric-views";

import { KpiFilters } from "./KpiFilters";
import { KpiGraphCard } from "./KpiGraphCard";
import { KpiDataTable } from "./KpiDataTable";
import { KpiOverlayCard } from "./KpiOverlayCard";
import { KpiRawDataTable, type KpiRawMetric } from "./KpiRawDataTable";
import {
  MAX_GRAPHS,
  appliedPayload,
  analyticRows,
  catalogEntries,
  chosenStatistic,
  exportRows,
  fromSearch,
  toSearch,
  toggleCode,
} from "./workspace-model";
import {
  type WorkspaceLayout,
  type WorkspaceTabsState,
  activeTab as pickActiveTab,
  addTab,
  encodeTabs,
  initialTabsState,
  removeTab,
  reorderTab,
  updateTab,
} from "./workspace-tabs";
import { WorkspaceTabsBar } from "./WorkspaceTabsBar";
import { PanelShell } from "./PanelShell";
import { WorkspaceGrid } from "./WorkspaceGrid";
import "./workspace.css";

export function KpiWorkspace() {
  useTranslation();
  const { activeProject } = useActiveProject();
  if (!activeProject) return <NoActiveProject scope="KPI Analytics" />;
  return <ProjectWorkspace key={activeProject.id} projectId={activeProject.id} />;
}
function ProjectWorkspace({ projectId }: { projectId: string }) {
  const { t: translate } = useTranslation();
  // Project/filter-keyed requests can finish into the cache after navigation.
  const catalog = useQuery(kpiCatalogQuery(projectId));
  const dimensions = useQuery(kpiFiltersQuery(projectId));
  const project = useQuery(analyticsProjectQuery(projectId));
  if (catalog.isPending)
    return (
      <p className="p-6" role="status">
        {" "}
        {translate("kpi.3b735c01e192")}{" "}
      </p>
    );
  if (catalog.isError)
    return (
      <div className="p-6" role="alert">
        <p>{catalog.error.message}</p>
        <button className="kpi-button" onClick={() => void catalog.refetch()}>
          <RefreshCw size={14} /> {translate("kpi.d61cacf6ec3e")}{" "}
        </button>
      </div>
    );
  return (
    <Workspace
      catalog={catalog.data}
      projectId={projectId}
      dimensions={dimensions.data}
      dimensionsLoading={dimensions.isPending}
      dimensionsError={dimensions.isError}
      retryDimensions={() => void dimensions.refetch()}
      period={
        project.data?.periodStart && project.data?.periodEnd
          ? `${project.data.periodStart} — ${project.data.periodEnd}`
          : null
      }
    />
  );
}
function Workspace({
  catalog,
  projectId,
  dimensions,
  dimensionsLoading,
  dimensionsError,
  retryDimensions,
  period,
}: {
  catalog: ProjectKpiCatalog;
  projectId: string;
  dimensions?: ProjectKpiFilters | undefined;
  dimensionsLoading: boolean;
  dimensionsError: boolean;
  retryDimensions: () => void;
  period: string | null;
}) {
  const { t: translate } = useTranslation();
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const navigate = useNavigate();
  const { set: setSharedFilters } = useFilters();
  const entries = useMemo(() => catalogEntries(catalog), [catalog]);
  const cataloguePanel = useRef<PanelImperativeHandle>(null);
  const [catalogueCollapsed, setCatalogueCollapsed] = useState(false);
  // 1.75.0 (BC3) — Spec v2 Phase B : état d'onglets persistés en URL (?tabs=
  // base64-JSON). Backcompat ?kpis=... et ?kpi=... : ancien schéma mono-onglet
  // décodé en un tab par défaut si ?tabs= absent.
  const tabsStorageKey = `bc4.kpi.tabs.${projectId}`;
  const legacyMetrics = Array.isArray(search["metrics"])
    ? search["metrics"].filter((v): v is string => typeof v === "string")
    : [];
  const storedTabs = useMemo(() => {
    try {
      return localStorage.getItem(tabsStorageKey);
    } catch {
      return null;
    }
  }, [tabsStorageKey]);
  // 1.105.0 — un projet jamais ouvert démarre VIDE : un lien qui traîne un
  // ancien ?kpis=/?kpi=/?metrics= ne remplit plus le premier onglet. La session
  // se restaure par ?tabs= ou par les onglets mémorisés du projet.
  const [tabsState, setTabsStateRaw] = useState<WorkspaceTabsState>(() =>
    initialTabsState({
      urlTabs: typeof search["tabs"] === "string" ? search["tabs"] : "",
      storedTabs,
      legacyMetrics,
    }),
  );
  const currentTab = pickActiveTab(tabsState);
  const codes = currentTab.codes;
  const active = currentTab.activeCode;
  const persistTabs = (next: WorkspaceTabsState) => {
    setTabsStateRaw(next);
    const encoded = encodeTabs(next);
    try {
      localStorage.setItem(tabsStorageKey, encoded);
    } catch {
      /* ignore */
    }
    void navigate({
      to: ".",
      search: (previous: Record<string, unknown>) => ({
        ...previous,
        tabs: encoded,
        kpis: pickActiveTab(next).codes,
        kpi: pickActiveTab(next).codes[0],
        metrics: pickActiveTab(next).metricCodes ?? [],
      }),
      replace: true,
    } as never);
  };
  const setActive = (code: string | null) =>
    persistTabs(updateTab(tabsState, tabsState.activeTabId, { activeCode: code }));
  const setLayout = (tabId: string, layout: WorkspaceLayout) =>
    persistTabs(updateTab(tabsState, tabId, { layout }));
  const setOverlay = (tabId: string, overlay: boolean) =>
    persistTabs(updateTab(tabsState, tabId, { overlay }));
  const queryClient = useQueryClient();
  const storageKey = `bc4.kpi.visualizations.${projectId}`;
  const [configs, setConfigs] = useState<Record<string, ChartConfig>>(() => {
    try {
      const stored: unknown = JSON.parse(sessionStorage.getItem(storageKey) ?? "{}");
      if (!stored || typeof stored !== "object") return {};
      return Object.fromEntries(
        Object.entries(stored).filter(
          ([code, config]) =>
            entries.some((entry) => entry.item.code === code) &&
            config &&
            config.kpiCode === code &&
            config.yMetric === code &&
            [
              "histogram",
              "graph",
              "table",
              "map",
              "task_series",
              "task_scatter",
              "chronogram",
            ].includes(config.visualization) &&
            ["none", "operator", "band", "operator_band", "dor"].includes(config.groupBy) &&
            config.xMetric === config.groupBy &&
            [null, "value", "p10", "p50", "p90"].includes(config.statistic),
        ),
      );
    } catch {
      return {};
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(configs));
    } catch {
      /* Memory-only when storage is unavailable. */
    }
  }, [configs, storageKey]);
  const configFor = (code: string) => configs[code] ?? defaultConfig(code, "none");
  const updateConfig = (code: string, next: ChartConfig) => {
    const previous = configFor(code);
    if (previous.groupBy !== next.groupBy) {
      void queryClient.cancelQueries({
        queryKey: [
          "project-kpi",
          "detail",
          projectId,
          code,
          { ...applied, group_by: previous.groupBy },
        ],
        exact: true,
      });
    }
    setConfigs((prev) => ({ ...prev, [code]: next }));
    setSelectedRows(new Set());
  };
  const [captureId, setCaptureId] = useCaptureContext(projectId);
  // 1.92.0 — captureKind depuis /metrics/captures (back 0.76.1) pour badge
  // "Scanner" + désactivation UE cell_scoped metrics dans le catalogue.
  const metricsCapturesQuery = useQuery({
    queryKey: metricCapturesKey(projectId),
    queryFn: ({ signal }) => getMetricCaptures(projectId, {}, signal),
    staleTime: API_LEAN_STALE_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
  const captureKind =
    metricsCapturesQuery.data?.find((c) => c.capture_id === captureId)?.kind ?? null;
  // 1.49.0 (F2) — second catalogue : Métriques Nemo brutes depuis
  // /projects/{p}/metrics. Sélections distinctes des KPI (store propre
  // dans l'URL `metrics=[]`), rendues ensemble dans le panneau de droite.
  const [activeCatalog, setActiveCatalog] = useState<"kpi" | "metrics">("kpi");
  const metricsCatalog = useQuery(metricsCatalogQuery(projectId));
  const selectedMetrics = currentTab.metricCodes ?? [];
  const setSelectedMetrics = (next: string[]) =>
    persistTabs(updateTab(tabsState, tabsState.activeTabId, { metricCodes: next }));
  const toggleMetric = (code: string) => {
    const next = selectedMetrics.includes(code)
      ? selectedMetrics.filter((candidate) => candidate !== code)
      : [...selectedMetrics, code];
    setSelectedMetrics(next);
    // Une métrique retirée de l'onglet perd aussi la vue qui lui était liée.
    if (!next.includes(code) && metricViews[code]) {
      const rest = { ...metricViews };
      delete rest[code];
      writeViews(rest);
    }
  };
  // 1.73.0 (BC3) — vue partagée MetricsWorkspace, pilotée par le menu ⋯ du sidebar
  // premium ou par les onglets du workspace. MetricView (histogram|graph|table|map)
  // mappe 1-pour-1 sur View (scatter en plus côté workspace, non exposé au sidebar).
  const [metricsView, setMetricsView] = useState<MetricsView>("table");
  const [tableColumns, setTableColumns] = useState<{ code: string; label: string }[]>([]);
  const [metricsTablePane, setMetricsTablePane] = useState(false);
  const [metricsPaneRequest, setMetricsPaneRequest] = useState<{ pane: "table"; n: number }>({
    pane: "table",
    n: 0,
  });
  // 1.101.0 — la visualisation demandée pour chaque métrique (⋮ du catalogue).
  // Une métrique choisie en « Tableau » n'a jamais de carte graphique : elle
  // n'existe que dans le grand tableau des mesures. Mémorisée par onglet.
  const [viewsState, setViewsState] = useState(() => ({
    tabId: tabsState.activeTabId,
    views: readMetricViews(tabsState.activeTabId),
  }));
  if (viewsState.tabId !== tabsState.activeTabId) {
    setViewsState({
      tabId: tabsState.activeTabId,
      views: readMetricViews(tabsState.activeTabId),
    });
  }
  const metricViews = viewsState.views;
  const writeViews = (next: MetricViews) => {
    setViewsState({ tabId: tabsState.activeTabId, views: next });
    writeMetricViews(tabsState.activeTabId, next);
  };
  const graphMetricCount = selectedMetrics.filter(
    (code) => metricViews[code] !== "table",
  ).length;
  const tableOnlyWorkspace =
    selectedMetrics.length > 0 &&
    graphMetricCount === 0 &&
    codes.length === 0 &&
    metricsTablePane;
  const [cardViewRequest, setCardViewRequest] = useState<
    { code: string; view: MetricView; n: number } | undefined
  >();
  const visualizeMetric = (code: string, view: MetricView) => {
    writeViews({ ...metricViews, [code]: view });
    if (!selectedMetrics.includes(code)) {
      setSelectedMetrics([...selectedMetrics, code]);
    }
    if (view === "table") {
      // 1.91.0 — ⋮ → Tableau ouvre le grand tableau des métriques (avec les
      // colonnes de paramètres). 1.101.0 — cette métrique ne reçoit aucune
      // carte graphique : le tableau est sa seule représentation.
      setMetricsTablePane(true);
      setMetricsPaneRequest((r) => ({ pane: "table", n: r.n + 1 }));
      return;
    }
    // 1.102.2 — un graphe ajouté ne change jamais la vue du tableau des
    // mesures : sinon le tableau devenait un graphe unique de toutes les métriques.
    setCardViewRequest((r) => ({ code, view, n: (r?.n ?? 0) + 1 }));
  };
  // 1.49.5 — mode de visualisation par métrique (histogram | graph | table | map),
  // piloté soit par le menu de la carte, soit par le `…` du MetricsCatalogSidebar.

  const [draft, setDraft] = useState(() => fromSearch(search));
  // URL is the applied shared state; edits stay local until Apply.
  const urlDraft = useMemo(() => fromSearch(search), [search]);
  const applied = useMemo(
    () => ({
      ...appliedPayload(urlDraft, dimensions),
      ...(captureId ? { capture_id: captureId } : {}),
    }),
    [urlDraft, dimensions, captureId],
  );
  const draftPayload = appliedPayload(draft, dimensions);
  const dirty =
    JSON.stringify(draftPayload) !== JSON.stringify(appliedPayload(urlDraft, dimensions));
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [limitMessage, setLimitMessage] = useState("");
  const catalogSearch = useRef<HTMLInputElement>(null);
  const effectiveActive = codes.includes(active ?? "") ? active : (codes[0] ?? null);
  const visibleCodes = codes;
  const queries = useQueries({
    queries: visibleCodes.map((code) => ({
      queryKey: [
        "project-kpi",
        "detail",
        projectId,
        code,
        { ...applied, group_by: configFor(code).groupBy },
      ],
      queryFn: ({ signal }) =>
        getProjectKpi(projectId, code, { ...applied, group_by: configFor(code).groupBy }, signal),
      enabled: !dimensionsLoading && !dimensionsError,
      staleTime: 60_000,
      retry: false,
      retryOnMount: false,
      refetchOnWindowFocus: false,
    })),
  });
  const panels = visibleCodes.flatMap((code, index) => {
    const entry = entries.find((e) => e.item.code === code),
      query = queries[index];
    if (!entry || !query) return [];
    const stat = chosenStatistic(query.data, configFor(code).statistic ?? undefined);
    return [{ entry, query, stat, rows: query.data ? analyticRows(query.data, stat) : [] }];
  });
  const rows = panels
    .filter((panel) => !configFor(panel.entry.item.code).visualization.startsWith("task_"))
    .flatMap((panel) => panel.rows);
  const saveCodes = (nextCodes: string[]) => {
    persistTabs(
      updateTab(tabsState, tabsState.activeTabId, {
        codes: nextCodes,
        activeCode: nextCodes.includes(currentTab.activeCode ?? "")
          ? currentTab.activeCode
          : (nextCodes[0] ?? null),
      }),
    );
  };
  const toggle = (code: string) => {
    if (!codes.includes(code) && codes.length >= MAX_GRAPHS) {
      setLimitMessage(`Limite de ${MAX_GRAPHS} graphiques atteinte.`);
      return;
    }
    const nextCodes = toggleCode(codes, code);
    persistTabs(
      updateTab(tabsState, tabsState.activeTabId, {
        codes: nextCodes,
        activeCode: nextCodes.includes(code) ? code : (nextCodes[0] ?? null),
      }),
    );
    setLimitMessage("");
  };
  const visualize = (code: string, visualization: VisualizationType) => {
    const nextCodes = codes.includes(code) ? codes : [...codes, code];
    if (!codes.includes(code) && codes.length >= MAX_GRAPHS) return;
    persistTabs(
      updateTab(tabsState, tabsState.activeTabId, {
        codes: nextCodes,
        activeCode: code,
      }),
    );
    updateConfig(code, { ...configFor(code), visualization });
  };
  const move = (code: string, direction: -1 | 1) => {
    const nextCodes = [...codes],
      index = nextCodes.indexOf(code),
      target = index + direction;
    if (target < 0 || target >= nextCodes.length) return;
    [nextCodes[index], nextCodes[target]] = [nextCodes[target]!, nextCodes[index]!];
    saveCodes(nextCodes);
  };
  const focus = (code: string) => {
    setActive(code);
    requestAnimationFrame(() =>
      document
        .getElementById(`kpi-graph-${code}`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
    );
  };
  const apply = () => {
    setSharedFilters(toSearch(draftPayload) as never);
    setSelectedRows(new Set());
  };
  const reset = () => setDraft({ values: {}, enabledGeo: [] });
  const addGraph = () => {
    catalogSearch.current?.focus();
    catalogSearch.current?.scrollIntoView({ block: "nearest" });
  };
  const onCatalogToggle = (code: string) => toggle(code);
  const toggleRow = (id: string) =>
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <main className="kpi-workspace" aria-label="KPI Analytics">
      <KpiFilters
        draft={draft}
        applied={applied}
        dimensions={dimensions}
        period={period}
        dirty={dirty}
        loading={dimensionsLoading}
        error={dimensionsError}
        onRetry={retryDimensions}
        onChange={setDraft}
        onApply={apply}
        onReset={reset}
      />
      <ResizablePanelGroup orientation="horizontal" className="kpi-workspace-panels">
        <ResizablePanel
          id="kpi-catalog-panel"
          defaultSize="280px"
          minSize="230px"
          maxSize="460px"
          panelRef={cataloguePanel}
          collapsible
          collapsedSize="36px"
          onResize={() => setCatalogueCollapsed(cataloguePanel.current?.isCollapsed() ?? false)}
          className="kpi-sidebar-panel"
        >
          {catalogueCollapsed && (
            <div className="kpi-catalog-rail" data-testid="kpi-catalog-rail">
              <Button
                variant="ghost"
                size="icon"
                className="kpi-catalog-toggle"
                title={translate("panel.expand_catalogue")}
                aria-label={translate("panel.expand_catalogue")}
                onClick={() => cataloguePanel.current?.expand()}
              >
                <PanelLeftOpen size={15} />
              </Button>
            </div>
          )}
          <div className="kpi-sidebar-tabs" hidden={catalogueCollapsed}>
            <div
              className="kpi-sidebar-tabbar"
              role="tablist"
              aria-label={translate("kpi.103451395067")}
              style={{
                display: "flex",
                gap: 0,
                borderBottom: "1px solid var(--border, #d9dee5)",
                padding: "4px 6px 0",
                background: "var(--panel, #fff)",
              }}
            >
              <button
                role="tab"
                aria-selected={activeCatalog === "kpi"}
                title={`${translate("kpi.3ad34a87a145")} · ${codes.length}`}
                aria-label={`${translate("kpi.3ad34a87a145")} · ${codes.length}`}
                className={`kpi-button ${activeCatalog === "kpi" ? "primary" : ""}`}
                onClick={() => setActiveCatalog("kpi")}
                style={{
                  color: "var(--foreground)",
                  padding: "6px 12px",
                  borderRadius: "4px 4px 0 0",
                  border: "none",
                  background: activeCatalog === "kpi" ? "transparent" : "transparent",
                  borderBottom:
                    activeCatalog === "kpi"
                      ? "2px solid var(--primary, #1b5fd6)"
                      : "2px solid transparent",
                  fontWeight: activeCatalog === "kpi" ? 600 : 400,
                }}
              >
                {translate("kpi.3ad34a87a145")}
              </button>
              <button
                role="tab"
                aria-selected={activeCatalog === "metrics"}
                title={`${translate("metrics.498227f2b5c6")} · ${selectedMetrics.length}`}
                aria-label={`${translate("metrics.498227f2b5c6")} · ${selectedMetrics.length}`}
                className={`kpi-button ${activeCatalog === "metrics" ? "primary" : ""}`}
                onClick={() => setActiveCatalog("metrics")}
                style={{
                  color: "var(--foreground)",
                  padding: "6px 12px",
                  borderRadius: "4px 4px 0 0",
                  border: "none",
                  background: "transparent",
                  borderBottom:
                    activeCatalog === "metrics"
                      ? "2px solid var(--primary, #1b5fd6)"
                      : "2px solid transparent",
                  fontWeight: activeCatalog === "metrics" ? 600 : 400,
                }}
              >
                {translate("metrics.498227f2b5c6")}
              </button>
              <Button
                variant="ghost"
                size="icon"
                className="kpi-catalog-toggle ml-auto self-center"
                title={translate("panel.collapse_catalogue")}
                aria-label={translate("panel.collapse_catalogue")}
                data-testid="kpi-catalog-collapse"
                onClick={() => cataloguePanel.current?.collapse()}
              >
                <PanelLeftClose size={15} />
              </Button>
            </div>
            {activeCatalog === "kpi" ? (
              <KpiCatalogSidebar
                catalog={catalog}
                selected={codes}
                active={effectiveActive}
                onToggle={onCatalogToggle}
                onVisualization={visualize}
                searchRef={catalogSearch}
              />
            ) : (
              <MetricsCatalogSidebar
                projectId={projectId}
                selected={selectedMetrics}
                onToggle={toggleMetric}
                onVisualization={visualizeMetric}
                searchRef={catalogSearch}
                captureKind={captureKind}
              />
            )}
          </div>
        </ResizablePanel>
        <ResizableHandle
          withHandle
          className="kpi-resize-handle"
          aria-label={translate("kpi.9afd5ab37dac")}
        />
        <ResizablePanel id="kpi-analysis-panel" minSize="300px">
          <div
            className={`kpi-analysis-scroll${tableOnlyWorkspace ? " kpi-analysis-table-only" : ""}`}
          >
            {limitMessage && (
              <p role="status" className="text-xs text-amber-700">
                {limitMessage}
              </p>
            )}
            {/* 1.92.0 — bandeau Scanner visible dès que la capture active est
                un scanner, même sans métrique sélectionnée. Jamais caché. */}
            {activeCatalog === "metrics" && captureKind === "scanner" && (
              <div
                role="alert"
                className="m-2 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"
                data-testid="scanner-capture-banner"
              >
                <strong>Scanner capture</strong> · UE cell metrics (RSRP, CA,
                throughput per layer) not available in scanner mode — Ibflex-Scanner
                captures only expose <code>SCANCONFIG / STARTSCAN / CELLSCAN /
                OFDMSCAN</code> events. UE cell leaves in the catalogue are
                disabled with tooltip "no UE cell metrics in scanner capture"
                (never hidden). Future "Scanner view" lot open — see CHANGELOG
                back 0.76.1.
              </div>
            )}
            {currentTab.overlay && panels.length >= 2 ? (
              <KpiOverlayCard
                panels={panels.map((p) => ({ entry: p.entry, rows: p.rows }))}
                onDisable={() => setOverlay(tabsState.activeTabId, false)}
              />
            ) : null}
            <WorkspaceGrid
              count={panels.length + graphMetricCount + (metricsTablePane ? 1 : 0)}
              layout={currentTab.layout}
              hidden={currentTab.overlay && panels.length >= 2}
            >
              <TableSettingsWorkspaceContext.Provider value={tabsState.activeTabId}>
                {panels.map(({ entry, query, stat, rows: graphRows }, natural) => (
                  <PanelShell
                    key={entry.item.code}
                    workspaceId={tabsState.activeTabId}
                    id={`kpi:${entry.item.code}`}
                    natural={natural}
                    defaultTitle={entry.item.name}
                    fullRow={configFor(entry.item.code).visualization === "table"}
                  >
                    {(panelTitle) => (
                      <KpiGraphCard
                        projectId={projectId}
                        appliedFilters={applied}
                        captureId={captureId}
                        onCaptureChange={setCaptureId}
                        entry={
                          panelTitle === entry.item.name
                            ? entry
                            : { ...entry, item: { ...entry.item, name: panelTitle } }
                        }
                        query={query}
                        blockedReason={
                          dimensionsLoading
                            ? translate("kpi.f58ddd1effba")
                            : dimensionsError
                              ? translate("kpi.a237d197caeb")
                              : undefined
                        }
                        rows={graphRows}
                        statistic={stat}
                        config={configFor(entry.item.code)}
                        groupOptions={(
                          [
                            "none",
                            "operator",
                            "band",
                            "operator_band",
                            ...(dimensions?.dor?.available ? ["dor"] : []),
                          ] as KpiGroupBy[]
                        ).filter(
                          (g) =>
                            g === "none" ||
                            g === "dor" ||
                            (g === "operator"
                              ? dimensions?.operators?.available
                              : g === "band"
                                ? dimensions?.bands?.available
                                : dimensions?.operators?.available && dimensions?.bands?.available),
                        )}
                        onConfig={(next) => updateConfig(entry.item.code, next)}
                        onStatistic={(value) =>
                          updateConfig(entry.item.code, {
                            ...configFor(entry.item.code),
                            statistic: value,
                          })
                        }
                        active={effectiveActive === entry.item.code}
                        onActivate={() => setActive(entry.item.code)}
                        selectedRows={selectedRows}
                        onSelectRow={toggleRow}
                        onRemove={() => toggle(entry.item.code)}
                        onMove={(direction) => move(entry.item.code, direction)}
                        index={codes.indexOf(entry.item.code)}
                        count={codes.length}
                      />
                    )}
                  </PanelShell>
                ))}
                {selectedMetrics.length > 0 && (
                  <MetricsWorkspace
                    key={currentTab.id}
                    projectId={projectId}
                    captureId={captureId}
                    onCaptureChange={setCaptureId}
                    selections={selectedMetrics}
                    catalog={metricsCatalog.data?.metrics ?? []}
                    filters={applied}
                    view={metricsView}
                    onViewChange={setMetricsView}
                    onTablePaneChange={setMetricsTablePane}
                    views={metricViews}
                    onVisualization={visualizeMetric}
                    workspaceId={tabsState.activeTabId}
                    onColumnsChange={setTableColumns}
                    paneRequest={metricsPaneRequest.n}
                    cardViewRequest={cardViewRequest}
                    onClear={() => {
                      setSelectedMetrics([]);
                    }}
                    onRemove={(code: string) =>
                      setSelectedMetrics(selectedMetrics.filter((item) => item !== code))
                    }
                  />
                )}
              </TableSettingsWorkspaceContext.Provider>
            </WorkspaceGrid>
            {!panels.length && !selectedMetrics.length && (
              <div className="kpi-empty-workspace">
                <BarChart3 size={28} />
                <h2>{translate("kpi.97f764ab0b74")}</h2>
                <p>{translate("kpi.ed0d56673d65")}</p>
                <button className="kpi-button primary" onClick={addGraph}>
                  <Plus size={14} /> {translate("kpi.b8982dc44102")}{" "}
                </button>
              </div>
            )}
            <div id="kpi-workspace-data">
              {(() => {
                if (!panels.length) return null;
                // 1.43.0 — Tableau brut : si au moins un KPI « temporel »
                // (temporal_source != null) est sélectionné en mode
                // Graphique, on affiche les observations brutes de la
                // capture active plutôt que l'agrégat (mandat §8). Les
                // KPI task_* gardent leur rendu propre (points sous la
                // série) comme avant.
                const rawMetrics: KpiRawMetric[] = panels
                  .filter(
                    (panel) =>
                      configFor(panel.entry.item.code).visualization === "graph" &&
                      !!panel.entry.item.temporal_source,
                  )
                  .map((panel) => ({
                    code: panel.entry.item.code,
                    label: panel.entry.item.name,
                    unit: panel.entry.item.unit ?? null,
                  }));
                if (rawMetrics.length > 0) {
                  return (
                    <KpiRawDataTable
                      projectId={projectId}
                      captureId={captureId}
                      metrics={rawMetrics}
                    />
                  );
                }
                if (
                  panels.every((panel) =>
                    configFor(panel.entry.item.code).visualization.startsWith("task_"),
                  )
                ) {
                  return (
                    <p className="p-3 text-xs text-muted-foreground">
                      {" "}
                      {translate("kpi.717260829dcc")}{" "}
                    </p>
                  );
                }
                return (
                  <TableSettingsWorkspaceContext.Provider value={tabsState.activeTabId}>
                    <KpiDataTable rows={rows} selected={selectedRows} onSelect={setSelectedRows} />
                  </TableSettingsWorkspaceContext.Provider>
                );
              })()}
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
      <WorkspaceTabsBar
        columns={tableColumns}
        tabs={tabsState.tabs}
        activeTabId={tabsState.activeTabId}
        onSelect={(id) => persistTabs({ ...tabsState, activeTabId: id })}
        onCreate={() => persistTabs(addTab(tabsState))}
        onClose={(id) => persistTabs(removeTab(tabsState, id))}
        onRename={(id, name) => persistTabs(updateTab(tabsState, id, { name }))}
        onReorder={(from, to) => persistTabs(reorderTab(tabsState, from, to))}
        onLayoutChange={setLayout}
        onOverlayToggle={setOverlay}
      />
    </main>
  );
}
