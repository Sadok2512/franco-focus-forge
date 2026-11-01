import {
  kpiCatalogQuery,
  kpiFiltersQuery,
  metricsCatalogQuery,
  analyticsProjectQuery,
  dictTreeQuery,
} from "@/lib/analytics-bootstrap";
import { useTranslation } from "react-i18next";
import { useCaptureContext } from "@/lib/capture-context";
import { analysisScopeSearch, type AnalysisScope } from "@/lib/analysis-scope";
import { VisualizationItems } from "./VisualizationMenu";
import { defaultConfig, type ChartConfig, type VisualizationType } from "./visualization-model";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { BarChart3, Download, PanelLeftClose, PanelLeftOpen, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PanelImperativeHandle } from "react-resizable-panels";
import {
  getDictV2Distribution,
  getMetricCaptures,
  getMetricMap,
  getProjectKpi,
} from "@/lib/api/client";
import { listSuperstreams } from "@/lib/api/superstreams";
import {
  createWorkspaceTemplate,
  deleteWorkspaceTemplate,
  listWorkspaceTemplates,
  renameWorkspaceTemplate,
  updateWorkspaceTemplate,
  type WorkspaceTemplate,
} from "@/lib/api/workspace-templates";
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
import { API_LEAN_STALE_MS, metricCapturesKey, metricMapKey } from "./query-keys";
import type { MetricView } from "./MetricGraphCard";
import { readMetricViews, writeMetricViews, type MetricViews } from "./metric-views";
import { TreePanel, type TreePanelView } from "@/features/dict-v2/TreePanel";
import { ValueExplorer } from "@/features/dict-v2/ValueExplorer";
import { SelectedParameterInfo } from "@/features/dict-v2/SelectedParameterInfo";
import {
  identifyTrees,
  selectedParameter,
  selectionId,
} from "@/features/dict-v2/parameter-identity";
import { toggleCatalogSelection } from "@/features/dict-v2/catalog-model";
import type { DictLeaf, GroupByMode } from "@/lib/api/dict-v2";

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
  classifyKpiCatalog,
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
import { ActiveEventsProvider } from "./active-events";
import { MetricsEventsRibbon } from "./MetricsEventsRibbon";
import { WorkspaceTemplatesProvider } from "./workspace-templates-context";
import {
  restoreWorkspaceTemplate,
  snapshotWorkspaceTemplate,
  workspaceTemplateSignature,
} from "./workspace-template-state";
import { loadTableSettings } from "./table-settings";
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
  const project = useQuery(analyticsProjectQuery(projectId));
  if (catalog.isPending)
    return (
      <p className="p-6" role="status">
        {" "}
        {translate("kpi.catalogReconnecting")}{" "}
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
      catalogLoading={catalog.isFetching && catalog.data.tree.length === 0}
      projectId={projectId}
      period={
        project.data?.periodStart && project.data?.periodEnd
          ? `${project.data.periodStart} — ${project.data.periodEnd}`
          : null
      }
      projectCenter={project.data?.center}
    />
  );
}
function Workspace({
  catalog,
  catalogLoading,
  projectId,
  period,
  projectCenter,
}: {
  catalog: ProjectKpiCatalog;
  catalogLoading: boolean;
  projectId: string;
  period: string | null;
  projectCenter?: [number, number] | undefined;
}) {
  const { t: translate } = useTranslation();
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const navigate = useNavigate();
  const { set: setSharedFilters } = useFilters();
  const entries = useMemo(() => catalogEntries(catalog), [catalog]);
  const classifiedCatalogs = useMemo(() => classifyKpiCatalog(catalog), [catalog]);
  const cataloguePanel = useRef<PanelImperativeHandle>(null);
  const cataloguePreferenceKey = `bc4.kpi.catalogueCollapsed.${projectId}`;
  const [catalogueCollapsed, setCatalogueCollapsed] = useState(() => {
    try {
      return localStorage.getItem(cataloguePreferenceKey) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (!catalogueCollapsed) return;
    const frame = requestAnimationFrame(() => cataloguePanel.current?.collapse());
    return () => cancelAnimationFrame(frame);
    // Only restore once when this project workspace mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const rememberCatalogueCollapsed = (collapsed: boolean) => {
    setCatalogueCollapsed(collapsed);
    try {
      localStorage.setItem(cataloguePreferenceKey, collapsed ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  };
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
  const eventsPreferenceKey = `bc4.kpi.events.${projectId}.${currentTab.id}`;
  const [eventsPreference, setEventsPreference] = useState(() => ({
    tabId: currentTab.id,
    visible: localStorage.getItem(eventsPreferenceKey) !== "0",
  }));
  if (eventsPreference.tabId !== currentTab.id) {
    setEventsPreference({
      tabId: currentTab.id,
      visible: localStorage.getItem(eventsPreferenceKey) !== "0",
    });
  }
  const eventsVisible = eventsPreference.visible;
  const setEventsVisible = (visible: boolean) => {
    setEventsPreference({ tabId: currentTab.id, visible });
    try {
      localStorage.setItem(eventsPreferenceKey, visible ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
    requestAnimationFrame(() => window.dispatchEvent(new CustomEvent("bc4:workspace-resize")));
  };
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
  const [captureId, setCaptureId] = useCaptureContext(projectId);
  const metricsCapturesQuery = useQuery({
    queryKey: metricCapturesKey(projectId),
    queryFn: ({ signal }) => getMetricCaptures(projectId, {}, signal),
    staleTime: API_LEAN_STALE_MS,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
  const superstreamsQuery = useQuery({
    queryKey: ["superstreams", projectId],
    queryFn: ({ signal }) => listSuperstreams(projectId, signal),
    staleTime: 30_000,
  });
  const requestedSuperstream =
    search["analysis_scope"] === "superstream" && typeof search["superstream_id"] === "string"
      ? superstreamsQuery.data?.find((stream) => stream.id === search["superstream_id"])
      : undefined;
  const requestedCapture =
    search["analysis_scope"] === "capture" && typeof search["capture_id"] === "string"
      ? search["capture_id"]
      : captureId;
  const analysisScope: AnalysisScope | null = requestedSuperstream
    ? {
        type: "superstream",
        superstreamId: requestedSuperstream.id,
        revision: requestedSuperstream.revision,
      }
    : requestedCapture
      ? { type: "capture", captureId: requestedCapture }
      : null;
  const scopeCaptureIds = requestedSuperstream
    ? requestedSuperstream.captureIds
    : requestedCapture
      ? [requestedCapture]
      : [];
  const dimensionsQuery = useQuery(kpiFiltersQuery(projectId, scopeCaptureIds));
  const dimensions = dimensionsQuery.data;
  const dimensionsLoading = dimensionsQuery.isPending;
  const dimensionsError = dimensionsQuery.isError;
  const retryDimensions = () => void dimensionsQuery.refetch();
  const templatesQuery = useQuery({
    queryKey: ["workspace-templates", projectId],
    queryFn: ({ signal }) => listWorkspaceTemplates(projectId, signal),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (analysisScope || !metricsCapturesQuery.data?.[0]) return;
    setCaptureId(metricsCapturesQuery.data[0].capture_id);
  }, [analysisScope, metricsCapturesQuery.data, setCaptureId]);

  const changeAnalysisScope = (next: AnalysisScope) => {
    void queryClient.cancelQueries({
      predicate: (query) => query.queryKey.some((part) => part === projectId),
    });
    if (next.type === "capture") setCaptureId(next.captureId);
    else {
      const stream = superstreamsQuery.data?.find((candidate) => candidate.id === next.superstreamId);
      const first = stream?.captureIds[0];
      if (first) setCaptureId(first);
    }
    void navigate({
      to: ".",
      search: (previous: Record<string, unknown>) => ({
        ...previous,
        ...analysisScopeSearch(next),
      }),
      replace: true,
    } as never);
    void queryClient.invalidateQueries({ queryKey: ["project-kpi", "catalog", projectId] });
    void queryClient.invalidateQueries({ queryKey: ["project-metrics", projectId] });
  };
  const readConfigs = (tabId: string): Record<string, ChartConfig> => {
    try {
      const tabKey = `bc4.kpi.visualizations.${projectId}.${tabId}`;
      const legacyKey = `bc4.kpi.visualizations.${projectId}`;
      const raw = localStorage.getItem(tabKey) ?? sessionStorage.getItem(legacyKey) ?? "{}";
      const stored: unknown = JSON.parse(raw);
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
  };
  const [configsState, setConfigsState] = useState(() => ({
    tabId: currentTab.id,
    configs: readConfigs(currentTab.id),
  }));
  if (configsState.tabId !== currentTab.id) {
    setConfigsState({ tabId: currentTab.id, configs: readConfigs(currentTab.id) });
  }
  const configs = configsState.configs;
  const storageKey = `bc4.kpi.visualizations.${projectId}.${currentTab.id}`;
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(configs));
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
    setConfigsState((previous) => ({
      tabId: currentTab.id,
      configs: { ...(previous.tabId === currentTab.id ? previous.configs : {}), [code]: next },
    }));
    setSelectedRows(new Set());
  };
  // 1.92.0 — captureKind depuis /metrics/captures (back 0.76.1) pour badge
  // "Scanner" + désactivation UE cell_scoped metrics dans le catalogue.
  const captureKind =
    metricsCapturesQuery.data?.find((c) => c.capture_id === captureId)?.kind ?? null;
  // 1.49.0 (F2) — second catalogue : Métriques Nemo brutes depuis
  // /projects/{p}/metrics. Sélections distinctes des KPI (store propre
  // dans l'URL `metrics=[]`), rendues ensemble dans le panneau de droite.
  const [activeCatalog, setActiveCatalog] = useState<"kpi" | "metrics" | "parameters">("kpi");
  const [parameterTreeView, setParameterTreeView] = useState<TreePanelView>("catalog");
  const [parameterSelection, setParameterSelection] = useState<DictLeaf[]>([]);
  const [parameterGroupBy, setParameterGroupBy] = useState<GroupByMode>("operator");
  const [parameterResetTick, setParameterResetTick] = useState(0);
  const metricsCatalog = useQuery(metricsCatalogQuery(projectId));
  const catalogSelectableMetricCount = useMemo(
    () =>
      (metricsCatalog.data?.nodes ?? []).filter(
        (node) => node.node_type === "leaf" && node.selectable,
      ).length,
    [metricsCatalog.data],
  );
  const measuredMetricCodes = useMemo(
    () => new Set(catalogEntries(classifiedCatalogs.metrics).map((entry) => entry.item.code)),
    [classifiedCatalogs.metrics],
  );
  const [metricsSearch, setMetricsSearch] = useState("");
  const [visibleMeasuredMetricCount, setVisibleMeasuredMetricCount] = useState(
    measuredMetricCodes.size,
  );
  const [visibleCatalogMetricCount, setVisibleCatalogMetricCount] = useState(
    catalogSelectableMetricCount,
  );
  const updateVisibleMeasuredMetricCount = useCallback(
    (count: number) => setVisibleMeasuredMetricCount(count),
    [],
  );
  const updateVisibleCatalogMetricCount = useCallback(
    (count: number) => setVisibleCatalogMetricCount(count),
    [],
  );
  const selectableMetricCount = visibleMeasuredMetricCount + visibleCatalogMetricCount;
  const metricsCatalogLoading = metricsCatalog.isPending && !metricsCatalog.data;
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
  const graphMetricCount = selectedMetrics.filter((code) => metricViews[code] !== "table").length;
  const tableOnlyWorkspace =
    selectedMetrics.length > 0 && graphMetricCount === 0 && codes.length === 0 && metricsTablePane;
  const mapOnlyWorkspace =
    !metricsTablePane &&
    ((codes.length === 0 &&
      selectedMetrics.length === 1 &&
      metricViews[selectedMetrics[0]!] === "map") ||
      (selectedMetrics.length === 0 &&
        codes.length === 1 &&
        configFor(codes[0]!).visualization === "map"));
  const [cardViewRequest, setCardViewRequest] = useState<
    { code: string; view: MetricView; n: number } | undefined
  >();
  const prefetchMetricMap = (code: string) => {
    if (!captureId) return;
    const nextViews = { ...metricViews, [code]: "map" as const };
    const nextSelected = selectedMetrics.includes(code)
      ? selectedMetrics
      : [...selectedMetrics, code];
    const mapSelections = nextSelected.filter((selection) => nextViews[selection] === "map");
    void queryClient.prefetchQuery({
      queryKey: metricMapKey(projectId, captureId, mapSelections, applied),
      queryFn: ({ signal }) => getMetricMap(projectId, captureId, mapSelections, applied, signal),
      staleTime: 60_000,
    });
  };
  const visualizeMetric = (code: string, view: MetricView) => {
    // Graph, map and table are independent: showing a metric in the table never
    // removes its existing graph/map card. Only a metric with no card yet is
    // marked "table" (table-only).
    const keepsCard =
      view === "table" && selectedMetrics.includes(code) && metricViews[code] !== "table";
    const nextViews = keepsCard ? metricViews : { ...metricViews, [code]: view };
    const nextSelected = selectedMetrics.includes(code)
      ? selectedMetrics
      : [...selectedMetrics, code];
    // Start the lean request in the menu event, before MapLibre's workspace
    // mounts. useQuery below adopts the same in-flight promise by key.
    if (view === "map") prefetchMetricMap(code);
    if (!keepsCard) writeViews(nextViews);
    if (!selectedMetrics.includes(code)) setSelectedMetrics(nextSelected);
    if (view === "table") {
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
  const autoDetectedScope = useRef("");
  const scopeIdentity = analysisScope
    ? analysisScope.type === "capture"
      ? `capture:${analysisScope.captureId}`
      : `superstream:${analysisScope.superstreamId}:${analysisScope.revision}`
    : "none";
  useEffect(() => {
    if (!dimensions || !analysisScope || autoDetectedScope.current === scopeIdentity) return;
    const availableRats = (dimensions.rats?.values ?? []).filter(
      (value): value is "LTE" | "NR" => value === "LTE" || value === "NR",
    );
    const availableOperators = new Set(dimensions.operators?.values ?? []);
    const current = fromSearch(search);
    const values = { ...current.values, rat: availableRats };
    const selectedOperators = current.values.operator?.filter((value) =>
      availableOperators.has(value),
    );
    if (selectedOperators?.length) values.operator = selectedOperators;
    else delete values.operator;
    const detected = { ...current, values };
    autoDetectedScope.current = scopeIdentity;
    setDraft(detected);
    setSharedFilters(toSearch(appliedPayload(detected, dimensions)) as never);
  }, [analysisScope, dimensions, scopeIdentity, search, setSharedFilters]);
  // URL is the applied shared state; edits stay local until Apply.
  const urlDraft = useMemo(() => fromSearch(search), [search]);
  const applied = useMemo(
    () => ({
      ...appliedPayload(urlDraft, dimensions),
      ...(captureId ? { capture_id: captureId } : {}),
    }),
    [urlDraft, dimensions, captureId],
  );
  const parameterTechnology: "LTE" | "NR" | "LTE+NR" =
    applied.rat?.length === 1 && (applied.rat[0] === "LTE" || applied.rat[0] === "NR")
      ? applied.rat[0]
      : "LTE+NR";
  const parameterCatalogQ = useQuery({
    ...dictTreeQuery(projectId, "catalog"),
    enabled: activeCatalog === "parameters",
  });
  const parameterRawQ = useQuery({
    ...dictTreeQuery(projectId, "raw"),
    enabled: activeCatalog === "parameters" && parameterTreeView === "raw",
  });
  const parameterTrees = useMemo(
    () => identifyTrees(parameterCatalogQ.data ?? null, parameterRawQ.data ?? null),
    [parameterCatalogQ.data, parameterRawQ.data],
  );
  const selectedParameterKeys = useMemo(
    () =>
      [
        ...new Set(
          parameterSelection
            .filter(
              (leaf) =>
                !leaf["mapping_error"] &&
                (parameterTechnology === "LTE+NR" || leaf["technology"] === parameterTechnology),
            )
            .map((leaf) => leaf.param_key),
        ),
      ].sort(),
    [parameterSelection, parameterTechnology],
  );
  const parameterGeo = useMemo(
    () => ({
      ...(applied.dor?.length ? { dor: applied.dor } : {}),
      ...(applied.plaque?.length ? { plaque: applied.plaque } : {}),
      ...(applied.arcep?.length ? { arcep_zone: applied.arcep } : {}),
    }),
    [applied.arcep, applied.dor, applied.plaque],
  );
  const parameterDistributionQ = useQuery({
    queryKey: [
      "dict-v2",
      "distribution",
      projectId,
      selectedParameterKeys,
      parameterGroupBy,
      parameterTechnology,
      parameterGeo,
    ],
    queryFn: ({ signal }) =>
      getDictV2Distribution(
        projectId,
        selectedParameterKeys,
        parameterGroupBy,
        signal,
        parameterGeo,
        parameterTechnology,
      ),
    enabled: selectedParameterKeys.length > 0,
    staleTime: Infinity,
    retry: false,
  });
  const parameterSelectedSet = useMemo(
    () => new Set(parameterSelection.map(selectionId)),
    [parameterSelection],
  );
  const toggleParameter = (leaf: DictLeaf) => {
    const resolved = selectedParameter(leaf);
    setParameterSelection((previous) =>
      previous.some((item) => selectionId(item) === selectionId(resolved))
        ? previous.filter((item) => selectionId(item) !== selectionId(resolved))
        : [...previous, resolved],
    );
  };
  const draftPayload = appliedPayload(draft, dimensions);
  const dirty =
    JSON.stringify(draftPayload) !== JSON.stringify(appliedPayload(urlDraft, dimensions));
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [limitMessage, setLimitMessage] = useState("");
  const catalogSearch = useRef<HTMLInputElement>(null);
  const effectiveActive = codes.includes(active ?? "") ? active : (codes[0] ?? null);
  const visibleCodes = codes;
  const analyticCaptureIds = scopeCaptureIds.length
    ? scopeCaptureIds
    : captureId
      ? [captureId]
      : [];
  const kpiRequests = analyticCaptureIds.flatMap((memberCaptureId, memberPosition) =>
    visibleCodes.map((code) => ({ code, memberCaptureId, memberPosition })),
  );
  const queries = useQueries({
    queries: kpiRequests.map(({ code, memberCaptureId, memberPosition }) => ({
      queryKey: [
        "project-kpi",
        "detail",
        projectId,
        code,
        scopeIdentity,
        memberPosition,
        { ...applied, capture_id: memberCaptureId, group_by: configFor(code).groupBy },
      ],
      queryFn: ({ signal }) =>
        getProjectKpi(
          projectId,
          code,
          { ...applied, capture_id: memberCaptureId, group_by: configFor(code).groupBy },
          signal,
        ),
      enabled: !dimensionsLoading && !dimensionsError,
      staleTime: 60_000,
      retry: false,
      retryOnMount: false,
      refetchOnWindowFocus: false,
    })),
  });
  const panels = kpiRequests.flatMap(({ code, memberCaptureId, memberPosition }, index) => {
    const entry = entries.find((e) => e.item.code === code), query = queries[index];
    if (!entry || !query) return [];
    const stat = chosenStatistic(query.data, configFor(code).statistic ?? undefined);
    return [{
      entry,
      query,
      stat,
      rows: query.data ? analyticRows(query.data, stat) : [],
      memberCaptureId,
      memberPosition,
    }];
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
  const activeTemplateStorageKey = `bc4.kpi.activeTemplate.${projectId}.${currentTab.id}`;
  const readActiveTemplateId = () => {
    try {
      return localStorage.getItem(activeTemplateStorageKey);
    } catch {
      return null;
    }
  };
  const [activeTemplateState, setActiveTemplateState] = useState(() => ({
    tabId: currentTab.id,
    id: readActiveTemplateId(),
  }));
  if (activeTemplateState.tabId !== currentTab.id) {
    setActiveTemplateState({ tabId: currentTab.id, id: readActiveTemplateId() });
  }
  const activeTemplate =
    templatesQuery.data?.find((template) => template.id === activeTemplateState.id) ?? null;
  const [templateStateRevision, setTemplateStateRevision] = useState(0);
  useEffect(() => {
    const changed = () => setTemplateStateRevision((value) => value + 1);
    window.addEventListener("bc4-panel-layout", changed);
    window.addEventListener("bc4-table-settings", changed);
    window.addEventListener("bc4-metric-map-preferences", changed);
    window.addEventListener("bc4-metric-legend-settings", changed);
    window.addEventListener("bc4-metric-pane", changed);
    return () => {
      window.removeEventListener("bc4-panel-layout", changed);
      window.removeEventListener("bc4-table-settings", changed);
      window.removeEventListener("bc4-metric-map-preferences", changed);
      window.removeEventListener("bc4-metric-legend-settings", changed);
      window.removeEventListener("bc4-metric-pane", changed);
    };
  }, []);
  const currentTemplateConfiguration = () =>
    snapshotWorkspaceTemplate(currentTab, configs, metricViews);
  const currentTemplateSignature = workspaceTemplateSignature(currentTemplateConfiguration());
  const workspaceTemplateDirty = activeTemplate
    ? currentTemplateSignature !== workspaceTemplateSignature(activeTemplate.configuration)
    : codes.length > 0 || selectedMetrics.length > 0 || templateStateRevision > 0;
  const rememberActiveTemplate = (templateId: string | null) => {
    setActiveTemplateState({ tabId: currentTab.id, id: templateId });
    try {
      if (templateId) localStorage.setItem(activeTemplateStorageKey, templateId);
      else localStorage.removeItem(activeTemplateStorageKey);
    } catch {
      /* storage unavailable */
    }
  };
  const cacheTemplate = (template: WorkspaceTemplate) => {
    queryClient.setQueryData<WorkspaceTemplate[]>(["workspace-templates", projectId], (previous) => {
      const rest = (previous ?? []).filter((candidate) => candidate.id !== template.id);
      return [template, ...rest].sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt),
      );
    });
    rememberActiveTemplate(template.id);
  };
  const templateContext = {
    templates: templatesQuery.data ?? [],
    activeTemplate,
    loading: templatesQuery.isPending,
    error: templatesQuery.error instanceof Error ? templatesQuery.error : null,
    workspaceDirty: workspaceTemplateDirty,
    currentConfiguration: currentTemplateConfiguration,
    retry: () => void templatesQuery.refetch(),
    apply: async (template: WorkspaceTemplate) => {
      const restored = restoreWorkspaceTemplate(
        currentTab.id,
        template.configuration,
        loadTableSettings(currentTab.id).search,
      );
      persistTabs(updateTab(tabsState, currentTab.id, restored.tab));
      setConfigsState({ tabId: currentTab.id, configs: restored.chartConfigurations });
      setViewsState({ tabId: currentTab.id, views: restored.metricViews });
      rememberActiveTemplate(template.id);
      setSelectedRows(new Set());
      setTemplateStateRevision((value) => value + 1);
    },
    create: async (name: string, description: string | null) => {
      const created = await createWorkspaceTemplate(projectId, {
        name,
        description,
        configuration: currentTemplateConfiguration(),
      });
      cacheTemplate(created);
    },
    update: async () => {
      if (!activeTemplate) throw new Error("Aucun template actif.");
      const updated = await updateWorkspaceTemplate(
        projectId,
        activeTemplate,
        activeTemplate.description,
        currentTemplateConfiguration(),
      );
      cacheTemplate(updated);
    },
    rename: async (name: string) => {
      if (!activeTemplate) throw new Error("Aucun template actif.");
      cacheTemplate(await renameWorkspaceTemplate(projectId, activeTemplate, name));
    },
    remove: async () => {
      if (!activeTemplate) throw new Error("Aucun template actif.");
      await deleteWorkspaceTemplate(projectId, activeTemplate);
      queryClient.setQueryData<WorkspaceTemplate[]>(["workspace-templates", projectId], (previous) =>
        (previous ?? []).filter((candidate) => candidate.id !== activeTemplate.id),
      );
      rememberActiveTemplate(null);
    },
  };
  const availableRats = new Set(dimensions?.rats?.values ?? []);
  const catalogueNodesBySelection = new Map(
    (metricsCatalog.data?.nodes ?? [])
      .filter((node) => node.selection)
      .map((node) => [node.selection!, node]),
  );
  const metricInfoByCode = new Map(
    (metricsCatalog.data?.metrics ?? []).map((metric) => [metric.code, metric]),
  );
  const unavailableTemplateSelections = [
    ...codes
      .filter((code) => !entries.some((entry) => entry.item.code === code))
      .map((code) => ({ code, reason: translate("workspaceTemplates.kpiMissing") })),
    ...selectedMetrics.flatMap((code) => {
      const node = catalogueNodesBySelection.get(code);
      const baseCode = code.split("@", 1)[0] ?? code;
      const info = metricInfoByCode.get(code) ?? metricInfoByCode.get(baseCode);
      if (node && !node.selectable) {
        return [{ code, reason: node.reason ?? translate("workspaceTemplates.metricUnavailable") }];
      }
      if (!node && !measuredMetricCodes.has(code) && !info) {
        return [{ code, reason: translate("workspaceTemplates.metricMissing") }];
      }
      if (info?.tech === "LTE" && !availableRats.has("LTE")) {
        return [{ code, reason: translate("workspaceTemplates.lteMissing") }];
      }
      if (info?.tech === "NR" && !availableRats.has("NR")) {
        return [{ code, reason: translate("workspaceTemplates.nrMissing") }];
      }
      return [];
    }),
  ];
  return (
    <WorkspaceTemplatesProvider value={templateContext}>
    <ActiveEventsProvider resetKey={`${currentTab.id}:${scopeIdentity}`}>
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
        scope={analysisScope}
        captures={metricsCapturesQuery.data ?? []}
        superstreams={superstreamsQuery.data ?? []}
        sourcesLoading={metricsCapturesQuery.isPending || superstreamsQuery.isPending}
        onScopeChange={changeAnalysisScope}
        eventsVisible={eventsVisible}
        onEventsVisibleChange={setEventsVisible}
      />
      {eventsVisible && scopeCaptureIds.length > 0 && (
        <section className="kpi-events-scope" data-testid="kpi-events-scope">
          {scopeCaptureIds.map((memberCaptureId, memberPosition) => (
            <div key={memberCaptureId} data-member-position={memberPosition}>
              {analysisScope?.type === "superstream" && (
                <p className="kpi-capture-boundary">
                  Capture {memberPosition + 1} · {memberCaptureId}
                </p>
              )}
              <MetricsEventsRibbon
                projectId={projectId}
                captureId={memberCaptureId}
                filters={{ ...applied, capture_id: memberCaptureId }}
                syncId={`kpi-workspace-${currentTab.id}-${memberCaptureId}`}
              />
            </div>
          ))}
        </section>
      )}
      <ResizablePanelGroup orientation="horizontal" className="kpi-workspace-panels">
        <ResizablePanel
          id="kpi-catalog-panel"
          defaultSize="280px"
          minSize="230px"
          maxSize="460px"
          panelRef={cataloguePanel}
          collapsible
          collapsedSize="36px"
          onResize={() =>
            rememberCatalogueCollapsed(cataloguePanel.current?.isCollapsed() ?? false)
          }
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
                title={`${translate("kpi.catalogTabKpi")} · ${codes.length}`}
                aria-label={`${translate("kpi.catalogTabKpi")} · ${codes.length}`}
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
                {translate("kpi.catalogTabKpi")}
              </button>
              <button
                role="tab"
                aria-selected={activeCatalog === "metrics"}
                title={`${translate("kpi.catalogTabMetrics")} · ${selectableMetricCount}`}
                aria-label={`${translate("kpi.catalogTabMetrics")} · ${selectableMetricCount}`}
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
                {translate("kpi.catalogTabMetrics")} (
                {metricsCatalogLoading
                  ? translate("kpi.catalogReconnecting")
                  : selectableMetricCount}
                )
              </button>
              <button
                role="tab"
                aria-selected={activeCatalog === "parameters"}
                title={`${translate("kpi.catalogTabParameters")} · ${parameterSelection.length}`}
                aria-label={`${translate("kpi.catalogTabParameters")} · ${parameterSelection.length}`}
                className={`kpi-button ${activeCatalog === "parameters" ? "primary" : ""}`}
                onClick={() => setActiveCatalog("parameters")}
                style={{
                  color: "var(--foreground)",
                  padding: "6px 12px",
                  borderRadius: "4px 4px 0 0",
                  border: "none",
                  background: "transparent",
                  borderBottom:
                    activeCatalog === "parameters"
                      ? "2px solid var(--primary, #1b5fd6)"
                      : "2px solid transparent",
                  fontWeight: activeCatalog === "parameters" ? 600 : 400,
                }}
              >
                {translate("kpi.catalogTabParameters")}
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
                catalog={classifiedCatalogs.kpi}
                selected={codes}
                active={effectiveActive}
                onToggle={onCatalogToggle}
                onVisualization={visualize}
                searchRef={catalogSearch}
                loading={
                  catalogLoading || (dimensionsLoading && classifiedCatalogs.kpi.tree.length === 0)
                }
              />
            ) : activeCatalog === "metrics" ? (
              <MetricsCatalogSidebar
                projectId={projectId}
                selected={selectedMetrics}
                onToggle={toggleMetric}
                onVisualization={visualizeMetric}
                onVisualizationIntent={(code, view) => {
                  if (view === "map") prefetchMetricMap(code);
                }}
                searchRef={catalogSearch}
                search={metricsSearch}
                onSearchChange={setMetricsSearch}
                selectionCount={
                  selectedMetrics.length +
                  codes.filter((code) => measuredMetricCodes.has(code)).length
                }
                onVisibleCountChange={updateVisibleCatalogMetricCount}
                measuredTree={
                  <KpiCatalogSidebar
                    catalog={classifiedCatalogs.metrics}
                    selected={codes}
                    active={effectiveActive}
                    onToggle={onCatalogToggle}
                    onVisualization={visualize}
                    searchRef={catalogSearch}
                    searchValue={metricsSearch}
                    embedded
                    onVisibleCountChange={updateVisibleMeasuredMetricCount}
                  />
                }
                captureKind={captureKind}
              />
            ) : (
              <TreePanel
                techno={parameterTechnology}
                catalog={parameterTrees.catalog}
                raw={parameterTrees.raw}
                selected={parameterSelectedSet}
                onToggle={toggleParameter}
                onToggleCatalog={(parameter, technology, origin, leaf) =>
                  setParameterSelection((previous) =>
                    toggleCatalogSelection(previous, parameter, technology, origin, leaf),
                  )
                }
                onInfo={(leaf) => {
                  if (!parameterSelectedSet.has(selectionId(selectedParameter(leaf)))) {
                    toggleParameter(leaf);
                  }
                }}
                onReset={() => {
                  setParameterSelection([]);
                  setParameterResetTick((tick) => tick + 1);
                }}
                resetTick={parameterResetTick}
                categories={[]}
                onTemplateLeaf={() => undefined}
                onCategory={() => undefined}
                templatesLoading={false}
                templatesError={false}
                templateCatalog={parameterTrees.catalog}
                onViewChange={setParameterTreeView}
                showTemplates={false}
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
            className={`kpi-analysis-scroll${tableOnlyWorkspace ? " kpi-analysis-table-only" : ""}${mapOnlyWorkspace ? " kpi-analysis-map-only" : ""}`}
          >
            {activeCatalog === "parameters" && (
              <div className="m-2 space-y-3" data-testid="kpi-parameters-workspace">
                {!!(applied.operator?.length || applied.band?.length) && (
                  <p role="status" className="rrc-context-notice">
                    {translate("kpi.parametersUnsupportedFilters")}
                  </p>
                )}
                <ValueExplorer
                  catalog={parameterCatalogQ.data ?? null}
                  distribution={parameterDistributionQ.data ?? null}
                  groupBy={parameterGroupBy}
                  onGroupByChange={setParameterGroupBy}
                  isLoading={parameterDistributionQ.isPending}
                  error={parameterDistributionQ.error}
                  selectedKeys={selectedParameterKeys}
                  filtered={Object.keys(parameterGeo).length > 0}
                  onRetry={() => void parameterDistributionQ.refetch()}
                  hideGroupBy
                  hideEmptyPrompt
                  compactHierarchy
                />
                {parameterSelection.length > 0 && (
                  <SelectedParameterInfo
                    projectId={projectId}
                    selected={parameterSelection}
                    catalog={parameterCatalogQ.data ?? null}
                    distribution={parameterDistributionQ.data ?? null}
                    refreshing={parameterDistributionQ.isFetching}
                    locallyFiltered={Object.keys(parameterGeo).length > 0}
                  />
                )}
              </div>
            )}
            {limitMessage && (
              <p role="status" className="text-xs text-amber-700">
                {limitMessage}
              </p>
            )}
            {unavailableTemplateSelections.length > 0 && (
              <div
                role="alert"
                className="m-2 rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950"
                data-testid="workspace-unavailable-metrics"
              >
                <strong>{translate("workspaceTemplates.unavailable")}</strong>
                <ul className="mt-1 list-disc pl-4">
                  {unavailableTemplateSelections.map((item) => (
                    <li key={`${item.code}:${item.reason}`}>
                      {item.code} — {item.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {/* 1.92.0 — bandeau Scanner visible dès que la capture active est
                un scanner, même sans métrique sélectionnée. Jamais caché. */}
            {activeCatalog === "metrics" && captureKind === "scanner" && (
              <div
                role="alert"
                className="m-2 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"
                data-testid="scanner-capture-banner"
              >
                <strong>Scanner capture</strong> · UE cell metrics (RSRP, CA, throughput per layer)
                not available in scanner mode — Ibflex-Scanner captures only expose{" "}
                <code>SCANCONFIG / STARTSCAN / CELLSCAN / OFDMSCAN</code> events. UE cell leaves in
                the catalogue are disabled with tooltip "no UE cell metrics in scanner capture"
                (never hidden). Future "Scanner view" lot open — see CHANGELOG back 0.76.1.
              </div>
            )}
            {analysisScope?.type !== "superstream" && currentTab.overlay && panels.length >= 2 ? (
              <KpiOverlayCard
                panels={panels.map((p) => ({ entry: p.entry, rows: p.rows }))}
                onDisable={() => setOverlay(tabsState.activeTabId, false)}
              />
            ) : null}
            <WorkspaceGrid
              count={panels.length + graphMetricCount + (metricsTablePane ? 1 : 0)}
              layout={currentTab.layout}
              hidden={analysisScope?.type !== "superstream" && currentTab.overlay && panels.length >= 2}
              fillAvailable={mapOnlyWorkspace}
            >
              <TableSettingsWorkspaceContext.Provider value={tabsState.activeTabId}>
                {panels.map(({ entry, query, stat, rows: graphRows, memberCaptureId, memberPosition }, natural) => (
                  <PanelShell
                    key={`${memberCaptureId}:${entry.item.code}`}
                    workspaceId={tabsState.activeTabId}
                    id={`kpi:${entry.item.code}${analysisScope?.type === "superstream" ? `:${memberCaptureId}` : ""}`}
                    natural={natural}
                    defaultTitle={analysisScope?.type === "superstream" ? `${memberPosition + 1}. ${entry.item.name} · ${memberCaptureId}` : entry.item.name}
                    fullRow={configFor(entry.item.code).visualization === "table"}
                  >
                    {(panelTitle) => (
                      <KpiGraphCard
                        projectId={projectId}
                        workspaceId={tabsState.activeTabId}
                        appliedFilters={{ ...applied, capture_id: memberCaptureId }}
                        captureId={memberCaptureId}
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
                  <>
                    {analyticCaptureIds.map((memberCaptureId, memberPosition) => (
                      <MetricsWorkspace
                        key={`${currentTab.id}:${memberCaptureId}`}
                        projectId={projectId}
                        captureId={memberCaptureId}
                        onCaptureChange={(nextCaptureId) => {
                          if (analysisScope?.type !== "superstream") {
                            changeAnalysisScope({ type: "capture", captureId: nextCaptureId });
                          }
                        }}
                        selections={selectedMetrics}
                        catalog={metricsCatalog.data?.metrics ?? []}
                        filters={{ ...applied, capture_id: memberCaptureId }}
                        view={metricsView}
                        onViewChange={setMetricsView}
                        onTablePaneChange={setMetricsTablePane}
                        views={metricViews}
                        onVisualization={visualizeMetric}
                        mapFillsAvailable={mapOnlyWorkspace && analyticCaptureIds.length === 1}
                        workspaceId={tabsState.activeTabId}
                        projectCenter={projectCenter}
                        showEvents={false}
                        scopeLabel={
                          analysisScope?.type === "superstream"
                            ? `Capture ${memberPosition + 1} · ${memberCaptureId}`
                            : undefined
                        }
                        panelIdSuffix={
                          analysisScope?.type === "superstream" ? `:${memberCaptureId}` : ""
                        }
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
                    ))}
                  </>
                )}
              </TableSettingsWorkspaceContext.Provider>
            </WorkspaceGrid>
            {activeCatalog !== "parameters" && !panels.length && !selectedMetrics.length && (
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
                if (!panels.length || dataTableClosedFor === panelsKey) return null;
                // A map card never brings a data table with it (user request).
                if (
                  panels.every((panel) => {
                    const visualization = configFor(panel.entry.item.code).visualization;
                    // Map cards bring no table; temporal Table cards render their own rows.
                    return (
                      visualization === "map" ||
                      (visualization === "table" && !!panel.entry.item.temporal_source)
                    );
                  })
                )
                  return null;
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
                    <>
                      {analyticCaptureIds.map((memberCaptureId, memberPosition) => (
                        <section key={memberCaptureId}>
                          {analysisScope?.type === "superstream" && (
                            <p className="kpi-capture-boundary">
                              Capture {memberPosition + 1} · {memberCaptureId}
                            </p>
                          )}
                          <KpiRawDataTable
                            projectId={projectId}
                            captureId={memberCaptureId}
                            metrics={rawMetrics}
                          />
                        </section>
                      ))}
                    </>
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
                    {analysisScope?.type === "superstream" ? (
                      analyticCaptureIds.map((memberCaptureId, memberPosition) => (
                        <section key={memberCaptureId}>
                          <p className="kpi-capture-boundary">
                            Capture {memberPosition + 1} · {memberCaptureId}
                          </p>
                          <KpiDataTable
                            rows={panels
                              .filter((panel) => panel.memberCaptureId === memberCaptureId)
                              .flatMap((panel) => panel.rows)}
                            selected={selectedRows}
                            onSelect={setSelectedRows}
                            onClose={() => setDataTableClosedFor(panelsKey)}
                          />
                        </section>
                      ))
                    ) : (
                      <KpiDataTable
                        rows={rows}
                        selected={selectedRows}
                        onSelect={setSelectedRows}
                        onClose={() => setDataTableClosedFor(panelsKey)}
                      />
                    )}
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
    </ActiveEventsProvider>
    </WorkspaceTemplatesProvider>
  );
}
