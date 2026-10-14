// G3 — NR branch present on project A, explicit empty state on LTE-only project B.
import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { getDictTree } from "@/lib/api/client";
import { ProtocolTree } from "@/features/dictionary/ProtocolTree";
import { renderQ } from "./dictionary-helpers";

const sel = { msgId: null, msgName: null, techno: null, paramId: null };
const tree = (id: string, filters = {}) =>
  renderQ(
    <ProtocolTree
      projectId={id}
      filters={filters}
      sel={sel}
      onMessage={() => {}}
      onParam={() => {}}
    />,
  );

describe("G3 NR branch", () => {
  it("fixture A shows a populated NR branch", async () => {
    tree("idf-t3-2026");
    await screen.findByRole("treeitem", { name: /^NR/ });
    expect(await screen.findByRole("treeitem", { name: /RRCSetupRequest/ })).toBeInTheDocument();
    expect(screen.queryByText("Aucun paramètre NR sur ce projet")).toBeNull(); // negative
  });

  it("fixture B (LTE-only) shows the explicit NR empty state, never a fabricated zero", async () => {
    const api = await getDictTree("rennes-lte-2026", {});
    expect(api.branches.find((b) => b.techno === "NR")!.channels).toEqual([]);
    tree("rennes-lte-2026");
    expect(await screen.findByText("Aucun paramètre NR sur ce projet")).toBeInTheDocument();
    expect(screen.getByRole("treeitem", { name: /^LTE/ })).toBeInTheDocument();
    expect(screen.queryByRole("treeitem", { name: /RRCSetupRequest/ })).toBeNull();
  });

  it("NR filtered out keeps an explicit NR branch", async () => {
    tree("idf-t3-2026", { tech: ["LTE"] });
    await waitFor(() =>
      expect(screen.getByText("Aucune observation NR avec les filtres actifs")).toBeInTheDocument(),
    );
  });
});
