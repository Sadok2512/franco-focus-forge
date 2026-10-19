import { defaultConfig, type ChartConfig, type VisualizationType } from "./visualization-model";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { BarChart3, Download, Plus, RefreshCw, X } from "lucide-react";
import {
  getProject,
  getProjectKpi,
  getProjectKpiCatalog,
  getProjectKpiFilters,
} from "@/lib/api/client";
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
import { KpiFilters } from "./KpiFilters";
import { KpiGraphCard } from "./KpiGraphCard";
import { KpiDataTable } from "./KpiDataTable";
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
import "./workspace.css";

export function KpiWorkspace() {
  const { activeProject } = useActiveProject();
  if (!activeProject) return <NoActiveProject scope="KPI Analytics" />;
  return <ProjectWorkspace key={activeProject.id} projectId={activeProject.id} />;
}
function ProjectWorkspace({ projectId }: { projectId: string }) {
  // Project/filter-keyed requests can finish into the cache after navigation.
  const catalog = useQuery({
    queryKey: ["project-kpi", "catalog", projectId],
    queryFn: () => getProjectKpiCatalog(projectId),
    staleTime: 300_000,
  });
  const dimensions = useQuery({
    queryKey: ["project-kpi", "filters", projectId],
    queryFn: () => getProjectKpiFilters(projectId),
    staleTime: 60_000,
  });
  const project = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => getProject(projectId),
    staleTime: 60_000,
  });
  if (catalog.isPending)
    return (
      <p className="p-6" role="status">
        Chargement du catalogue KPI…
      </p>
    );
  if (catalog.isError)
    return (
      <div className="p-6" role="alert">
        <p>{catalog.error.message}</p>
        <button className="kpi-button" onClick={() => void catalog.refetch()}>
          <RefreshCw size={14} />
          Réessayer le catalogue
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
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const navigate = useNavigate();
  const { set: setSharedFilters } = useFilters();
  const entries = useMemo(() => catalogEntries(catalog), [catalog]);
  const [codes, setCodes] = useState<string[]>(() => {
    const requested = Array.isArray(search["kpis"])
      ? search["kpis"]
      : typeof search["kpi"] === "string"
        ? [search["kpi"]]
        : [];
    const valid = [...new Set(requested)]
      .filter(
        (code): code is string =>
          typeof code === "string" && entries.some((e) => e.item.code === code),
      )
      .slice(0, MAX_GRAPHS);
    return requested.length || Array.isArray(search["kpis"])
      ? valid
      : entries.find((e) => e.item.status === "AVAILABLE")
        ? [entries.find((e) => e.item.status === "AVAILABLE")!.item.code]
        : entries[0]
          ? [entries[0].item.code]
          : [];
  });
  const [active, setActive] = useState<string | null>(codes[0] ?? null);
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
            ["histogram", "graph", "table", "map", "task_series", "task_scatter"].includes(
              config.visualization,
            ) &&
            ["operator", "band", "operator_band", "dor"].includes(config.groupBy) &&
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
  const configFor = (code: string) => configs[code] ?? defaultConfig(code, "operator_band");
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
  const [draft, setDraft] = useState(() => fromSearch(search));
  // URL is the applied shared state; edits stay local until Apply.
  const urlDraft = useMemo(() => fromSearch(search), [search]);
  const applied = useMemo(() => appliedPayload(urlDraft, dimensions), [urlDraft, dimensions]);
  const draftPayload = appliedPayload(draft, dimensions);
  const dirty = JSON.stringify(draftPayload) !== JSON.stringify(applied);
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
      queryFn: () =>
        getProjectKpi(projectId, code, { ...applied, group_by: configFor(code).groupBy }),
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
  const saveCodes = (next: string[]) => {
    setCodes(next);
    void navigate({
      to: ".",
      search: (prev: Record<string, unknown>) => ({ ...prev, kpis: next, kpi: next[0] }),
      replace: true,
    } as never);
  };
  const toggle = (code: string) => {
    if (!codes.includes(code) && codes.length >= MAX_GRAPHS) {
      setLimitMessage(`Limite de ${MAX_GRAPHS} graphiques atteinte.`);
      return;
    }
    const next = toggleCode(codes, code);
    saveCodes(next);
    setLimitMessage("");
    if (next.includes(code)) setActive(code);
  };
  const visualize = (code: string, visualization: VisualizationType) => {
    if (!codes.includes(code)) {
      if (codes.length >= MAX_GRAPHS) return;
      saveCodes([...codes, code]);
    }
    updateConfig(code, { ...configFor(code), visualization });
    setActive(code);
  };
  const move = (code: string, direction: -1 | 1) => {
    const next = [...codes],
      index = next.indexOf(code),
      target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    saveCodes(next);
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
          className="kpi-sidebar-panel"
        >
          <KpiCatalogSidebar
            catalog={catalog}
            selected={codes}
            active={effectiveActive}
            onToggle={toggle}
            onVisualization={visualize}
            searchRef={catalogSearch}
          />
        </ResizablePanel>
        <ResizableHandle
          withHandle
          className="kpi-resize-handle"
          aria-label="Redimensionner le catalogue KPI"
        />
        <ResizablePanel id="kpi-analysis-panel" minSize="300px">
          <div className="kpi-analysis-scroll">
            <div className="kpi-analysis-toolbar">
              <nav className="kpi-graph-tabs" aria-label="Graphiques sélectionnés">
                {codes.map((code, index) => (
                  <div key={code} className={effectiveActive === code ? "is-active" : ""}>
                    <button aria-pressed={effectiveActive === code} onClick={() => focus(code)}>
                      <span>{index + 1}</span>
                      {entries.find((e) => e.item.code === code)?.item.name ?? code}
                    </button>
                    <button aria-label={`Fermer ${code}`} onClick={() => toggle(code)}>
                      <X size={13} />
                    </button>
                  </div>
                ))}
                <button className="kpi-icon" aria-label="Ajouter une métrique" onClick={addGraph}>
                  <Plus size={16} />
                </button>
              </nav>
              <section className="kpi-workspace-controls" aria-label="Organisation des graphiques">
                <span className="kpi-chart-type" title="Choisir une vue dans le menu du graphique">
                  {effectiveActive ? "Visualisation active" : "Visualisations"}
                </span>
                <label className="kpi-select-label">
                  Grouper par
                  <select
                    aria-label="Grouper par"
                    disabled={
                      !!effectiveActive &&
                      configFor(effectiveActive).visualization === "task_series"
                    }
                    title={
                      effectiveActive && configFor(effectiveActive).visualization === "task_series"
                        ? "La série utilise les opérateurs et points de l’API"
                        : undefined
                    }
                    value={effectiveActive ? configFor(effectiveActive).groupBy : "operator_band"}
                    onChange={(e) => {
                      if (effectiveActive)
                        updateConfig(effectiveActive, {
                          ...configFor(effectiveActive),
                          groupBy: e.target.value as KpiGroupBy,
                          xMetric: e.target.value as KpiGroupBy,
                        });
                      setSelectedRows(new Set());
                    }}
                  >
                    <option value="operator">Opérateur</option>
                    <option value="band">Bande</option>
                    <option value="operator_band">Opérateur + bande</option>
                    {dimensions?.dor?.available && <option value="dor">DOR</option>}
                  </select>
                </label>
                <button
                  className="kpi-button"
                  disabled={!rows.length}
                  title={
                    !rows.length
                      ? "Les points Task Time sont exportables depuis leur graphique"
                      : "Exporter les agrégats"
                  }
                  onClick={() => exportRows(rows, "bc4-kpi-workspace")}
                >
                  <Download size={14} />
                  Export
                </button>
              </section>
            </div>
            {limitMessage && (
              <p role="status" className="text-xs text-amber-700">
                {limitMessage}
              </p>
            )}
            <div className="kpi-graph-grid" data-count={panels.length}>
              {panels.map(({ entry, query, stat, rows: graphRows }) => (
                <KpiGraphCard
                  projectId={projectId}
                  appliedFilters={applied}
                  key={entry.item.code}
                  entry={entry}
                  query={query}
                  blockedReason={
                    dimensionsError
                      ? "Dimensions du projet indisponibles. Réessayez depuis les filtres."
                      : undefined
                  }
                  rows={graphRows}
                  statistic={stat}
                  config={configFor(entry.item.code)}
                  groupOptions={(
                    [
                      "operator",
                      "band",
                      "operator_band",
                      ...(dimensions?.dor?.available ? ["dor"] : []),
                    ] as KpiGroupBy[]
                  ).filter(
                    (g) =>
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
              ))}
            </div>
            {!panels.length && (
              <div className="kpi-empty-workspace">
                <BarChart3 size={28} />
                <h2>Choisissez vos métriques</h2>
                <p>Cochez un ou plusieurs KPI dans le catalogue pour commencer l’analyse.</p>
                <button className="kpi-button primary" onClick={addGraph}>
                  <Plus size={14} />
                  Ajouter un graphique
                </button>
              </div>
            )}
            <div id="kpi-workspace-data">
              {panels.length &&
              panels.every(
                (panel) => configFor(panel.entry.item.code).visualization.startsWith("task_"),
              ) ? (
                <p className="p-3 text-xs text-muted-foreground">
                  Les points et leur export CSV figurent sous chaque série.
                </p>
              ) : (
                <KpiDataTable rows={rows} selected={selectedRows} onSelect={setSelectedRows} />
              )}
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </main>
  );
}
