import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";

const base = process.env.BC4_FRONT_BASE ?? "http://127.0.0.1:5174";
const projectId = process.env.BC4_PROJECT_ID ?? "43e81a34a073";
const output = process.argv[2];
const token = execFileSync(
  "docker",
  [
    "exec",
    "bc4-api-1",
    "python",
    "-c",
    "from app.config import settings; from app.services.auth import create_token; print(create_token(user_id='adm-be45f070eba8',role='admin',ttl_min=5,secret=settings.jwt_secret)[0])",
  ],
  { encoding: "utf8" },
).trim();

async function get(path) {
  const response = await fetch(`${base}/api${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

const [kpi, metrics, catalog, raw] = await Promise.all([
  get(`/projects/${projectId}/kpi/catalog`),
  get(`/projects/${projectId}/metrics`),
  get(`/projects/${projectId}/dict/v2/tree?view=catalog`),
  get(`/projects/${projectId}/dict/v2/tree?view=raw`),
]);
const kpiLeaves = kpi.tree.flatMap((technology) =>
  technology.families.flatMap((family) => family.kpis),
);
const metricLeaves = metrics.nodes.filter((node) => node.node_type === "leaf");
const catalogParameters = catalog.tree.flatMap((technology) =>
  technology.origins.flatMap((origin) =>
    (origin.categories ?? []).flatMap((category) =>
      category.subcategories.flatMap((subcategory) => subcategory.parameters),
    ),
  ),
);
const catalogMessageLeaves = catalogParameters.flatMap((parameter) => parameter.leaves ?? []);
const rawLeaves = raw.tree.flatMap((technology) =>
  technology.origins.flatMap((origin) =>
    (origin.messages ?? []).flatMap((message) => message.groups.flatMap((group) => group.kpis)),
  ),
);
const countsByNature = Object.fromEntries(
  [...new Set(kpiLeaves.map((leaf) => leaf.nature))]
    .sort()
    .map((nature) => [nature, kpiLeaves.filter((leaf) => leaf.nature === nature).length]),
);
const ambiguous = metricLeaves
  .filter((leaf) => !leaf.analytics_tab)
  .map(({ node_id, metric_id, selection, event, source_column }) => ({
    node_id,
    metric_id,
    selection,
    event,
    source_column,
  }));
const oldIds = [
  ...kpiLeaves.map((leaf) => `kpi:${leaf.code}`),
  ...metricLeaves.map((leaf) => `metrics:${leaf.node_id}`),
];
const actualKpiIds = kpiLeaves
  .filter((leaf) => leaf.analytics_tab === "kpi")
  .map((leaf) => `kpi:${leaf.code}`);
const actualMetricIds = [
  ...kpiLeaves.filter((leaf) => leaf.analytics_tab === "metrics").map((leaf) => `kpi:${leaf.code}`),
  ...metricLeaves
    .filter((leaf) => leaf.analytics_tab === "metrics")
    .map((leaf) => `metrics:${leaf.node_id}`),
];
const actualIds = [...actualKpiIds, ...actualMetricIds];
const actualIdSet = new Set(actualIds);
const report = {
  command: `BC4_FRONT_BASE=${base} node scripts/kpi_parameters_audit.mjs <output.json>`,
  projectId,
  catalogVersions: {
    kpi: kpi.catalog_version,
    metrics: metrics.catalog_release?.version ?? metrics.catalogue_version,
  },
  oldLeaves: {
    kpi: kpiLeaves.length,
    metrics: metricLeaves.length,
    namespacedUnion: kpiLeaves.length + metricLeaves.length,
    uniqueNamespacedIds: new Set(oldIds).size,
    uniqueMetricNodeIds: new Set(metricLeaves.map((leaf) => leaf.node_id)).size,
  },
  kpiNatureAudit: countsByNature,
  expectedPartitionAfterCatalogField: {
    kpi: kpiLeaves.filter((leaf) => ["Calculated KPI", "Counter"].includes(leaf.nature)).length,
    metrics:
      kpiLeaves.filter((leaf) => leaf.nature === "Measured metric").length + metricLeaves.length,
  },
  actualCatalogPartition: {
    kpi: actualKpiIds.length,
    metrics: actualMetricIds.length,
    union: actualIds.length,
    unique: actualIdSet.size,
    missing: oldIds.filter((id) => !actualIdSet.has(id)).length,
    duplicates: actualIds.length - actualIdSet.size,
  },
  missingAnalyticsTab: ambiguous.length,
  ambiguous,
  dictionary: {
    catalogParameters: catalogParameters.length,
    catalogMessageLeaves: catalogMessageLeaves.length,
    rawLeaves: rawLeaves.length,
    catalogDistinctParamKeys: catalog.distinct_param_keys,
    rawDistinctParamKeys: raw.distinct_param_keys,
  },
};

const rendered = `${JSON.stringify(report, null, 2)}\n`;
if (output) {
  await mkdir(new URL(".", new URL(output, `file://${process.cwd()}/`)), { recursive: true });
  await writeFile(output, rendered);
} else {
  process.stdout.write(rendered);
}
