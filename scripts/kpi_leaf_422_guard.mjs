import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";

const base = process.env.BC4_FRONT_BASE ?? "http://127.0.0.1:5175";
const projectId = process.env.BC4_PROJECT_ID ?? "43e81a34a073";
const captureId = process.env.BC4_CAPTURE_ID ?? "a4b0c321c52e";
const output =
  process.argv[2] ?? "audit/bc4-kpi-parameters-tab/metrics-leaves-max-points-2000.json";
const token = execFileSync(
  "docker",
  [
    "exec",
    "bc4-api-1",
    "python",
    "-c",
    "from app.config import settings; from app.services.auth import create_token; print(create_token(user_id='adm-be45f070eba8',role='admin',ttl_min=30,secret=settings.jwt_secret)[0])",
  ],
  { encoding: "utf8" },
).trim();
const headers = { Authorization: `Bearer ${token}` };
const catalogResponse = await fetch(`${base}/api/projects/${projectId}/metrics`, { headers });
if (!catalogResponse.ok) throw new Error(`catalog HTTP ${catalogResponse.status}`);
const catalog = await catalogResponse.json();
const codes = [...new Set(catalog.metrics.map((metric) => metric.code))].sort();

async function probe(code) {
  const query = new URLSearchParams({ capture_id: captureId, codes: code, max_points: "2000" });
  const url = `${base}/api/projects/${projectId}/metrics/series?${query}`;
  const started = performance.now();
  const response = await fetch(url, { headers });
  let detail = null;
  if (response.status !== 200) {
    try {
      detail = await response.json();
    } catch {
      detail = await response.text();
    }
  } else {
    await response.arrayBuffer();
  }
  return {
    code,
    status: response.status,
    elapsed_ms: Math.round(performance.now() - started),
    detail,
  };
}

const results = [];
const queue = [...codes];
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (queue.length) results.push(await probe(queue.shift()));
  }),
);
results.sort((a, b) => a.code.localeCompare(b.code));
const statusCounts = Object.fromEntries(
  [...new Set(results.map((result) => result.status))]
    .sort((a, b) => a - b)
    .map((status) => [status, results.filter((result) => result.status === status).length]),
);
const failures = results.filter((result) => ![200, 422].includes(result.status));
const report = {
  command: `BC4_FRONT_BASE=${base} node scripts/kpi_leaf_422_guard.mjs ${output}`,
  projectId,
  captureId,
  max_points: 2000,
  leaves_tested: results.length,
  statusCounts,
  accepted: [200, 422],
  failures,
  results,
  verdict: failures.length ? "FAIL" : "PASS",
};
await mkdir(new URL(".", new URL(output, `file://${process.cwd()}/`)), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `LEAVES=${results.length} STATUS=${JSON.stringify(statusCounts)} FAILURES=${failures.length} VERDICT=${report.verdict}`,
);
process.exitCode = failures.length ? 1 : 0;
