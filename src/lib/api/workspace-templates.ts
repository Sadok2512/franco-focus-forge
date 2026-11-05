import { z } from "zod";
import { apiFetch } from "./http";

const ChartConfigurationSchema = z
  .object({
    kpiCode: z.string(),
    visualization: z.enum([
      "histogram",
      "graph",
      "table",
      "map",
      "task_series",
      "task_scatter",
      "chronogram",
    ]),
    xMetric: z.enum(["none", "operator", "band", "operator_band", "dor"]),
    yMetric: z.string(),
    groupBy: z.enum(["none", "operator", "band", "operator_band", "dor"]),
    statistic: z.enum(["value", "p10", "p50", "p90"]).nullable(),
    curveType: z.enum(["points", "line", "line_points"]).optional(),
  })
  .strict();

const PanelLayoutSchema = z
  .object({
    order: z.array(z.string()),
    span: z.record(z.string(), z.union([z.literal(1), z.literal(2), z.literal(3)])),
    height: z.record(z.string(), z.number().int()),
    collapsed: z.record(z.string(), z.boolean()),
    titles: z.record(z.string(), z.string()),
    syncTime: z.boolean(),
  })
  .strict();

const TableSettingsSchema = z
  .object({
    perRow: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    autoFitWidth: z.boolean(),
    equalHeights: z.boolean(),
    spacing: z.enum(["compact", "normal", "wide"]),
    height: z.enum(["auto", "fixed", "custom"]),
    customHeight: z.number().int(),
    hScroll: z.enum(["auto", "always", "off"]),
    resizable: z.boolean(),
    style: z.enum(["clean", "professional", "compact"]),
    palette: z.enum(["white", "lightgray", "dark", "blue", "custom"]),
    colors: z
      .object({
        background: z.string(),
        headerBg: z.string(),
        headerText: z.string(),
        rowBg: z.string(),
        altRow: z.string(),
        border: z.string(),
        selected: z.string(),
      })
      .strict(),
    fontSize: z.enum(["small", "medium", "large"]),
    rowHeight: z.enum(["compact", "normal", "comfortable"]),
    headerHeight: z.enum(["compact", "normal", "large"]),
    cellPadding: z.enum(["small", "medium", "large"]),
    borders: z.enum(["none", "horizontal", "grid"]),
    zebra: z.boolean(),
    stickyHeader: z.boolean(),
    stickyFirstColumn: z.boolean(),
    wrap: z.boolean(),
    cellAlign: z.enum(["left", "center", "right"]),
    numberAlign: z.enum(["right", "center"]),
    radius: z.enum(["square", "rounded"]),
    hidden: z.array(z.string()),
    order: z.array(z.string()),
    showUnits: z.boolean(),
    sort: z.object({ col: z.string(), dir: z.enum(["asc", "desc"]) }).strict().nullable(),
  })
  .strict();

const MapPreferenceSchema = z
  .object({
    palette: z.enum(["coverage", "viridis", "ocean"]),
    pointSize: z.number(),
    links: z
      .object({ serving: z.boolean(), neighbour: z.boolean(), nr_anchor: z.boolean() })
      .strict(),
  })
  .strict();

const LegendSettingsSchema = z
  .object({
    count: z.number().int().nullable(),
    colors: z.record(z.string(), z.string()),
  })
  .strict();

export const WorkspaceTemplateConfigurationSchema = z
  .object({
    schemaVersion: z.literal(1),
    workspace: z
      .object({
        layout: z.enum(["auto", "1", "2", "3"]),
        overlay: z.boolean(),
        kpiCodes: z.array(z.string()),
        metricCodes: z.array(z.string()),
        activeKpiCode: z.string().nullable(),
        chartConfigurations: z.record(z.string(), ChartConfigurationSchema),
        metricViews: z.record(
          z.string(),
          z.enum(["graph", "histogram", "table", "map", "snapshot"]),
        ),
        panelLayout: PanelLayoutSchema,
        tableSettings: TableSettingsSchema,
        metricPane: z.enum(["charts", "table", "overlay"]),
        mapPreferences: z.record(z.string(), MapPreferenceSchema),
        legendSettings: z.record(z.string(), LegendSettingsSchema),
      })
      .strict(),
  })
  .strict();

export type WorkspaceTemplateConfiguration = z.infer<
  typeof WorkspaceTemplateConfigurationSchema
>;

export const WorkspaceTemplateSchema = z
  .object({
    id: z.string(),
    projectId: z.string(),
    ownerId: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    schemaVersion: z.number().int(),
    revision: z.number().int().positive(),
    configuration: WorkspaceTemplateConfigurationSchema,
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();

export type WorkspaceTemplate = z.infer<typeof WorkspaceTemplateSchema>;

const listSchema = z.array(WorkspaceTemplateSchema);
const base = (projectId: string) =>
  `/projects/${encodeURIComponent(projectId)}/workspace-templates`;

export function listWorkspaceTemplates(projectId: string, signal?: AbortSignal) {
  return apiFetch(base(projectId), listSchema, { signal });
}

export function createWorkspaceTemplate(
  projectId: string,
  input: {
    name: string;
    description: string | null;
    configuration: WorkspaceTemplateConfiguration;
  },
) {
  return apiFetch(base(projectId), WorkspaceTemplateSchema, {
    method: "POST",
    body: JSON.stringify({ ...input, schemaVersion: 1 }),
  });
}

export function updateWorkspaceTemplate(
  projectId: string,
  template: Pick<WorkspaceTemplate, "id" | "revision">,
  description: string | null,
  configuration: WorkspaceTemplateConfiguration,
) {
  return apiFetch(`${base(projectId)}/${encodeURIComponent(template.id)}`, WorkspaceTemplateSchema, {
    method: "PUT",
    headers: { "If-Match": `"${template.revision}"` },
    body: JSON.stringify({ description, schemaVersion: 1, configuration }),
  });
}

export function renameWorkspaceTemplate(
  projectId: string,
  template: Pick<WorkspaceTemplate, "id" | "revision">,
  name: string,
) {
  return apiFetch(
    `${base(projectId)}/${encodeURIComponent(template.id)}/name`,
    WorkspaceTemplateSchema,
    {
      method: "PATCH",
      headers: { "If-Match": `"${template.revision}"` },
      body: JSON.stringify({ name: name.trim() }),
    },
  );
}

export async function deleteWorkspaceTemplate(
  projectId: string,
  template: Pick<WorkspaceTemplate, "id" | "revision">,
) {
  await apiFetch(
    `${base(projectId)}/${encodeURIComponent(template.id)}`,
    z.unknown(),
    {
      method: "DELETE",
      headers: { "If-Match": `"${template.revision}"` },
    },
  );
}
