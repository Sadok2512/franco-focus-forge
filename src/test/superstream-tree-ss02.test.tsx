import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const stream = {
  id: "ss_1",
  projectId: "project-a",
  name: "Morning",
  logIds: ["b.nmf", "a.nmf"],
  captureIds: ["cap-b", "cap-a"],
  positions: [0, 1],
  members: [
    { position: 0, captureId: "cap-b", captureName: "b.nmf" },
    { position: 1, captureId: "cap-a", captureName: "a.nmf" },
  ],
  revision: 3,
  createdAt: "2026-10-31T00:00:00Z",
  updatedAt: "2026-10-31T00:00:00Z",
};

vi.mock("@/lib/api/superstreams", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/superstreams")>();
  return {
    ...actual,
    listSuperstreams: vi.fn(async () => [stream]),
    getProjectLogs: vi.fn(async () => []),
  };
});

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div role="menu">{children}</div>
  ),
  DropdownMenuItem: ({ children }: { children: React.ReactNode }) => (
    <div role="menuitem">{children}</div>
  ),
}));

import { SuperstreamTree } from "@/features/projects/SuperstreamTree";

function renderTree(canWrite: boolean) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SuperstreamTree projectId="project-a" projectName="Project A" canWrite={canWrite} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  sessionStorage.setItem(
    "bc4.superstreams.expanded",
    JSON.stringify(["project-a:streams", "project-a:ss:ss_1"]),
  );
});

describe("SS-02 Superstream tree", () => {
  it("renders members in backend position order", async () => {
    renderTree(true);
    const first = await screen.findByTitle("b.nmf · cap-b");
    const second = await screen.findByTitle("a.nmf · cap-a");
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("hides mutation actions from non-owners", async () => {
    renderTree(false);
    expect(await screen.findByLabelText("superstream.actionsFor")).toBeInTheDocument();
    expect(await screen.findByText("superstream.open")).toBeInTheDocument();
    expect(screen.getByText("superstream.openInSignaling")).toBeInTheDocument();
    expect(screen.getByText("superstream.openInMetrics")).toBeInTheDocument();
    expect(screen.getByText("superstream.openInMap")).toBeInTheDocument();
    expect(screen.queryByText("superstream.rename")).not.toBeInTheDocument();
  });

  it("shows mutation actions to owners", async () => {
    renderTree(true);
    expect(await screen.findByLabelText("superstream.actionsFor")).toBeInTheDocument();
    expect(await screen.findByText("superstream.rename")).toBeInTheDocument();
    expect(screen.getByText("superstream.editMembers")).toBeInTheDocument();
    expect(screen.getByText("superstream.delete")).toBeInTheDocument();
  });
});
