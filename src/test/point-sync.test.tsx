import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PointSyncProvider,
  pointMatchesRange,
  pointSyncChannelName,
  pointSyncStorageKey,
  usePointSync,
  type SyncedPoint,
} from "@/features/kpi/point-sync";

class FakeBroadcastChannel {
  static rooms = new Map<string, Set<FakeBroadcastChannel>>();
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;

  constructor(readonly name: string) {
    const room = FakeBroadcastChannel.rooms.get(name) ?? new Set();
    room.add(this);
    FakeBroadcastChannel.rooms.set(name, room);
  }

  postMessage(value: unknown) {
    for (const peer of FakeBroadcastChannel.rooms.get(this.name) ?? []) {
      if (peer !== this) peer.onmessage?.({ data: value } as MessageEvent<unknown>);
    }
  }

  close() {
    FakeBroadcastChannel.rooms.get(this.name)?.delete(this);
  }
}

function Probe({ name, workspaceId = "w1" }: { name: string; workspaceId?: string }) {
  const sync = usePointSync();
  return (
    <div>
      <output data-testid={`${name}-enabled`}>{String(sync.enabled)}</output>
      <output data-testid={`${name}-seq`}>{sync.selection?.seq ?? "none"}</output>
      <button type="button" onClick={() => sync.setEnabled(!sync.enabled)}>
        toggle-{name}
      </button>
      <button
        type="button"
        onClick={() =>
          sync.select({
            projectId: "p1",
            workspaceId,
            captureId: "c1",
            seq: 42,
            source: "map",
          })
        }
      >
        select-{name}
      </button>
    </div>
  );
}

describe("KPI point synchronization", () => {
  beforeEach(() => {
    localStorage.clear();
    FakeBroadcastChannel.rooms.clear();
    Object.defineProperty(globalThis, "BroadcastChannel", {
      configurable: true,
      value: FakeBroadcastChannel,
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("matches only an API-published sequence range in the same scope", () => {
    const point: SyncedPoint = {
      projectId: "p1",
      workspaceId: "w1",
      captureId: "c1",
      seq: 12,
      source: "graph",
    };
    expect(pointMatchesRange(point, "p1", "c1", 10, 14)).toBe(true);
    expect(pointMatchesRange(point, "p1", "c1", 13, 20)).toBe(false);
    expect(pointMatchesRange(point, "p1", "c2", 10, 14)).toBe(false);
  });

  it("persists the toggle and broadcasts selections across workspaces in one project", () => {
    render(
      <>
        <PointSyncProvider projectId="p1">
          <Probe name="a" />
        </PointSyncProvider>
        <PointSyncProvider projectId="p1">
          <Probe name="b" workspaceId="w2" />
        </PointSyncProvider>
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: "toggle-a" }));
    expect(localStorage.getItem(pointSyncStorageKey("p1"))).toBe("true");
    expect(screen.getByTestId("b-enabled")).toHaveTextContent("true");
    expect(pointSyncChannelName("p1")).toContain("p1");

    act(() => fireEvent.click(screen.getByRole("button", { name: "select-a" })));
    expect(screen.getByTestId("a-seq")).toHaveTextContent("42");
    expect(screen.getByTestId("b-seq")).toHaveTextContent("42");

    fireEvent.click(screen.getByRole("button", { name: "toggle-a" }));
    expect(screen.getByTestId("a-seq")).toHaveTextContent("none");
    expect(screen.getByTestId("b-seq")).toHaveTextContent("none");
  });

  it("does not broadcast a project selection to another project", () => {
    render(
      <>
        <PointSyncProvider projectId="p1">
          <Probe name="a" />
        </PointSyncProvider>
        <PointSyncProvider projectId="p2">
          <Probe name="b" workspaceId="w2" />
        </PointSyncProvider>
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: "toggle-a" }));
    fireEvent.click(screen.getByRole("button", { name: "toggle-b" }));
    act(() => fireEvent.click(screen.getByRole("button", { name: "select-a" })));
    expect(screen.getByTestId("a-seq")).toHaveTextContent("42");
    expect(screen.getByTestId("b-seq")).toHaveTextContent("none");
  });
});
