/** Temporary isolated presentation fixture; never used by product routes. */
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MetricsWorkspace } from "@/features/kpi/MetricsWorkspace";
import "@/features/kpi/workspace.css";
import "@/lib/i18n";
export function mountMetricsFixture() {
  const host = document.createElement("div");
  host.id = "metrics-fixture";
  host.className = "fixed inset-0 z-50 overflow-auto bg-background p-4";
  document.body.append(host);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const selections = ["cell_rsrp@0"];
  const data = {
    capture_id: "fixture", result_id: "TEST ONLY", decoder_version: "test", decode_level: "light",
    columns: [{ code: selections[0], label: "LTE RSRP · PCell", unit: "dBm", kind: "numeric" }],
    rows: [{ second: 0, t_rel_s: 0, seq_first: 1, seq_last: 1, time_label: "00:00", values: { "cell_rsrp@0": -90 }, counts: { "cell_rsrp@0": 1 } }],
    series: [{ kind: "numeric", label: "LTE RSRP · PCell", unit: "dBm", cell: "0", points: [{ t_rel_s: 0, value: -90 }, { t_rel_s: 1, value: -89 }] }],
    histogram: [], scatter: [], map_points: [], pair_rates: [], connected_seconds: null, connected_reason: null,
    aggregation: "TEST FIXTURE", time_policy: "TEST FIXTURE", pairing: "TEST FIXTURE", gaps: [], csv: "time,value\n0,-90"
  };
  client.setQueryData(["metric-captures", "fixture", {}], [{ capture_id: "fixture", label: "TEST FIXTURE — not a VM capture" }]);
  client.setQueryData(["metrics-v3", "fixture", "fixture", selections, {}, "operator", false, ""], data);
  createRoot(host).render(<QueryClientProvider client={client}><MetricsWorkspace projectId="fixture" captureId="fixture" onCaptureChange={() => {}} selections={selections} catalog={[]} filters={{}} onClear={() => { host.dataset["cleared"] = "true"; }} /></QueryClientProvider>);
}