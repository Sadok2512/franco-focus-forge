import type { WorkspaceTemplateConfiguration } from "@/lib/api/workspace-templates";
import {
  readMetricLegendSettings,
  writeMetricLegendSettings,
} from "./metric-classes";
import {
  readMetricMapPreferences,
  readMetricPane,
  writeMetricMapPreferences,
  writeMetricPane,
} from "./MetricsWorkspace";
import { loadLayout, saveLayout } from "./panel-layout";
import { loadTableSettings, saveTableSettings } from "./table-settings";
import type { ChartConfig } from "./visualization-model";
import type { MetricViews } from "./metric-views";
import { writeMetricViews } from "./metric-views";
import type { WorkspaceTab } from "./workspace-tabs";

export function snapshotWorkspaceTemplate(
  tab: WorkspaceTab,
  chartConfigurations: Record<string, ChartConfig>,
  metricViews: MetricViews,
): WorkspaceTemplateConfiguration {
  const { search: _temporarySearch, ...tableSettings } = loadTableSettings(tab.id);
  const selectedCharts = Object.fromEntries(
    Object.entries(chartConfigurations).filter(([code]) => tab.codes.includes(code)),
  );
  const selectedMetricViews = Object.fromEntries(
    Object.entries(metricViews).filter(([code]) => tab.metricCodes?.includes(code)),
  );
  const mapMetrics = (tab.metricCodes ?? []).filter((code) => metricViews[code] === "map");
  const mapKpis = tab.codes.filter(
    (code) => chartConfigurations[code]?.visualization === "map",
  );
  return {
    schemaVersion: 1,
    workspace: {
      layout: tab.layout,
      overlay: tab.overlay,
      kpiCodes: [...tab.codes],
      metricCodes: [...(tab.metricCodes ?? [])],
      activeKpiCode: tab.activeCode,
      chartConfigurations: selectedCharts,
      metricViews: selectedMetricViews,
      panelLayout: loadLayout(tab.id),
      tableSettings,
      metricPane: readMetricPane(tab.id),
      mapPreferences: Object.fromEntries(
        mapMetrics.map((code) => [code, readMetricMapPreferences(tab.id, code)]),
      ),
      legendSettings: Object.fromEntries(
        [...new Set([...mapMetrics, ...mapKpis])].map((code) => [
          code,
          readMetricLegendSettings(code),
        ]),
      ),
    },
  };
}

export function restoreWorkspaceTemplate(
  workspaceId: string,
  configuration: WorkspaceTemplateConfiguration,
  temporaryTableSearch: string,
) {
  const value = configuration.workspace;
  saveLayout(workspaceId, value.panelLayout);
  saveTableSettings(workspaceId, { ...value.tableSettings, search: temporaryTableSearch });
  writeMetricViews(workspaceId, value.metricViews);
  writeMetricPane(workspaceId, value.metricPane);
  for (const [code, preferences] of Object.entries(value.mapPreferences)) {
    writeMetricMapPreferences(workspaceId, code, preferences);
  }
  for (const [code, settings] of Object.entries(value.legendSettings)) {
    writeMetricLegendSettings(code, {
      count: settings.count,
      colors: Object.fromEntries(
        Object.entries(settings.colors).map(([index, color]) => [Number(index), color]),
      ),
    });
  }
  return {
    tab: {
      codes: [...value.kpiCodes],
      metricCodes: [...value.metricCodes],
      activeCode: value.activeKpiCode,
      layout: value.layout,
      overlay: value.overlay,
    } satisfies Partial<WorkspaceTab>,
    chartConfigurations: Object.fromEntries(
      Object.entries(value.chartConfigurations).map(([code, config]) => [
        code,
        {
          kpiCode: config.kpiCode,
          visualization: config.visualization,
          xMetric: config.xMetric,
          yMetric: config.yMetric,
          groupBy: config.groupBy,
          statistic: config.statistic,
          ...(config.curveType ? { curveType: config.curveType } : {}),
        } satisfies ChartConfig,
      ]),
    ),
    metricViews: value.metricViews,
  };
}

export function workspaceTemplateSignature(configuration: WorkspaceTemplateConfiguration) {
  return JSON.stringify(configuration);
}
