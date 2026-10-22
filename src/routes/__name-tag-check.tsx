// Temporary visual check for the click name chip. Deleted after screenshots.
import { createFileRoute } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RfTimeline } from "@/features/signaling/RfTimeline";
import type { RfEvent } from "@/lib/api/signaling";
import "@/features/signaling/signaling.css";

export const Route = createFileRoute("/__name-tag-check")({
  ssr: false,
  component: Page,
  head: () => ({ meta: [{ title: "Name chip check — BC4" }] }),
});

const base = {
  seq_end: null,
  t_rel_end_s: null,
  duration_ms: null,
  outcome: "ok",
  cause: null,
  pivot_seq: 1,
  linked_seqs: [],
  link_rule: "none",
  seq_gap: null,
  attrs: {},
} as const;

const events: RfEvent[] = [
  {
    ...base,
    id: "rrc-req",
    lane: "connexion",
    type: "RRC Request",
    kind: "mark",
    seq: 1,
    t_rel_s: 20,
    label: "RRC Request",
    attrs: { track: "network", protocol: "RRC LTE", source: "nemo" },
  },
  {
    ...base,
    id: "dl-1",
    lane: "services",
    type: "DL Data",
    kind: "bar",
    seq: 10,
    seq_end: 12,
    t_rel_s: 40,
    t_rel_end_s: 62,
    duration_ms: 22000,
    label: "DL Data Bearer 1",
    attrs: { track: "dl" },
  },
  {
    ...base,
    id: "ho-1",
    lane: "mobilite",
    type: "HOA",
    kind: "mark",
    seq: 20,
    t_rel_s: 75,
    label: "HOA",
    attrs: {},
  },
];

const points = Array.from({ length: 201 }, (_, i) => ({
  seq: i + 1,
  t_rel_s: i * 0.5,
  value: -100 + 12 * Math.sin(i / 9),
}));

function Page() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["signaling-rf", "p", "c", "", "", ""], {
    project_id: "p",
    capture_id: "c",
    result_id: "r",
    events,
    total: events.length,
    lanes: ["connexion", "services", "mobilite"],
    counts_by_lane: {},
    link_rule_counts: {},
    rule_version: null,
  });
  client.setQueryData(["signaling-rf-radio", "p", "c"], {
    project_id: "p",
    capture_id: "c",
    result_id: "r",
    duration_s: 100,
    series: [{ code: "cell_rsrp", points }],
  });
  return (
    <div className="h-screen bg-background p-6">
      <QueryClientProvider client={client}>
        <RfTimeline
          projectId="p"
          captureId="c"
          selectedTime={null}
          selectedEventId={null}
          onTime={() => {}}
          onSelect={() => {}}
          onRange={() => {}}
          technology=""
          direction=""
          search=""
          allowedProtocols={[]}
          timeWindow={[0, 100]}
          onWindow={() => {}}
        />
      </QueryClientProvider>
    </div>
  );
}
