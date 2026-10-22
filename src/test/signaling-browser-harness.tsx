/** Browser-only test fixture. Never imported by an application route. */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RfTimeline } from "@/features/signaling/RfTimeline";
import { EventRibbon } from "@/features/signaling/EventRibbon";
import { FULL_CAPTURE_S, useTimeWindow } from "@/features/signaling/time-window";
import "@/features/signaling/signaling.css";
export function mountCursorHarness(client?: QueryClient) {
  const host = document.createElement("div");
  host.id = "cursor-test-host";
  host.style.cssText =
    "position:fixed;inset:0;background:var(--background);padding:24px;z-index:99999";
  document.body.append(host);
  function Harness() {
    const { window, setWindow } = useTimeWindow("cursor-test", 300, FULL_CAPTURE_S);
    const [state, setState] = useState<{ time: number | null; id: string | null }>({
      time: null,
      id: null,
    });
    return (
      <div style={{ height: 650 }}>
        <h1>TEST FIXTURE — not a real capture</h1>
        <RfTimeline
          projectId="cursor-test"
          captureId="cursor-test"
          selectedTime={state.time}
          selectedEventId={state.id}
          onTime={(time) => setState({ time, id: null })}
          onSelect={(e, seq) => {
            host.dataset["selection"] = JSON.stringify({
              id: e.id,
              seq: seq ?? e.pivot_seq,
              time: e.t_rel_s,
            });
            setState({ time: e.t_rel_s, id: e.id });
          }}
          onRange={() => {}}
          technology=""
          direction=""
          search=""
          allowedProtocols={["RRC LTE", "RRC NR", "NAS"]}
          timeWindow={window}
          onWindow={setWindow}
        />
        <div style={{ height: 220 }}>
          <EventRibbon
            projectId="cursor-test"
            captureId="cursor-test"
            duration={300}
            timeWindow={window}
            selectedTime={state.time}
            onTime={(time) => setState({ time, id: null })}
            onSelect={(event) => setState({ time: event.t_rel_s, id: event.id })}
          />
        </div>
      </div>
    );
  }
  createRoot(host).render(
    <QueryClientProvider
      client={client ?? new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Harness />
    </QueryClientProvider>,
  );
}
