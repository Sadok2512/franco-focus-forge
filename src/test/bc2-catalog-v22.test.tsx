import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CatalogTree } from "@/features/dict-v2/CatalogTree";
import {
  catalogParameters,
  toggleCatalogSelection,
  messageAbbreviation,
} from "@/features/dict-v2/catalog-model";
import { templateLeaves, templateRows } from "@/features/dict-v2/template-model";
import type { DictTreeResponse } from "@/lib/api/dict-v2";
import type { TemplateCategory } from "@/lib/api/dict-templates";
import probe from "../../audit/bc2-lot-b/contract-probe.json";
const tree = probe.responses[0]!.body as unknown as DictTreeResponse;
const filtered = probe.responses[1]!.body as unknown as DictTreeResponse;
const item = catalogParameters(tree).find(
  (i) =>
    i.parameter.display_name === "timeToTrigger" &&
    i.parameter.leaves.some((l) => l.discriminators?.["event"] === "A1"),
)!;
describe("catalog v2.2 API selections", () => {
  it("sends the opaque aggregate key and replaces it with remaining leaves on partial selection", () => {
    const parent = toggleCatalogSelection([], item.parameter, item.technology, item.origin);
    expect(parent.map((p) => p.param_key)).toEqual([item.parameter.param_key]);
    expect(parent[0]!.n).toBe(item.parameter.n);
    const partial = toggleCatalogSelection(
      parent,
      item.parameter,
      item.technology,
      item.origin,
      item.parameter.leaves[0],
    );
    expect(partial.map((p) => p.param_key)).toEqual(
      item.parameter.leaves.slice(1).map((l) => l.param_key),
    );
    render(
      <CatalogTree
        tree={tree}
        techno="LTE"
        needle="timeToTrigger"
        selected={new Set(partial.map((l) => l.param_key))}
        onToggle={vi.fn()}
        resetTick={0}
      />,
    );
    const parents = screen.getAllByRole("checkbox", {
      name: "Sélectionner le paramètre timeToTrigger",
    });
    expect(parents.some((p) => p.getAttribute("aria-checked") === "mixed")).toBe(true);
  });
  it("uses leaf keys under a message filter instead of the unfiltered parent aggregate", () => {
    const filteredItem = catalogParameters(filtered).find(
      (i) => i.parameter.display_name === "additionalSpectrumEmission",
    )!;
    const selected = toggleCatalogSelection(
      [],
      filteredItem.parameter,
      filteredItem.technology,
      filteredItem.origin,
      undefined,
      false,
    );
    expect(selected.map((p) => p.param_key)).toEqual(
      filteredItem.parameter.leaves.map((l) => l.param_key),
    );
    expect(selected.some((p) => p.param_key === filteredItem.parameter.param_key)).toBe(false);
  });
  it("links template references through API-declared source_param_keys", () => {
    const categories = (
      probe.responses.at(-1)!.body as unknown as { categories: TemplateCategory[] }
    ).categories;
    const selected = templateLeaves(tree, categories[0]!);
    expect(selected.length).toBeGreaterThan(0);
    const declared = new Set(
      catalogParameters(tree).flatMap((i) => i.parameter.leaves.map((l) => l.param_key)),
    );
    expect(selected.every((l) => declared.has(l.param_key))).toBe(true);
  });
  it("keeps a TEST-only zero-population parameter visible, disabled and explained", () => {
    const zero = structuredClone(tree);
    const node = catalogParameters(zero)[0]!.parameter;
    node.display_name = "TEST-zero";
    node.n = 0;
    node.leaves = [];
    render(
      <CatalogTree
        tree={zero}
        techno="LTE"
        needle="TEST-zero"
        selected={new Set()}
        onToggle={vi.fn()}
        resetTick={0}
      />,
    );
    const control = screen.getByRole("checkbox", { name: "Sélectionner le paramètre TEST-zero" });
    expect(control).toBeDisabled();
    expect(control).toHaveAttribute("title", "0 occurrence dans ce périmètre");
    expect(screen.getByText("TEST-zero")).toBeVisible();
  });
  it("preserves full message names behind readable abbreviations", () => {
    expect(messageAbbreviation("SystemInformation - SIB2")).toBe("SIB2");
    expect(messageAbbreviation("SystemInformationBlockType1")).toBe("SIB1");
    expect(messageAbbreviation("RRCConnectionRelease")).toBe("RRCRel");
    expect(messageAbbreviation("TEST-unknown")).toBe("TEST-unknown");
  });
});

describe("Templates technology tree", () => {
  const categories = (probe.responses.at(-1)!.body as unknown as { categories: TemplateCategory[] })
    .categories;
  it("uses only API catalog references and counts for resolved leaves", () => {
    const rows = templateRows(tree, categories[0]!, "LTE");
    const declared = new Map(
      catalogParameters(tree)
        .filter((i) => i.technology === "LTE")
        .flatMap((i) => i.parameter.leaves.map((l) => [l.param_key, l] as const)),
    );
    expect(rows.some((r) => r.leaf)).toBe(true);
    for (const row of rows.filter((r) => r.leaf)) {
      expect(row.n).toBe(declared.get(row.leaf!.param_key)?.n);
      expect(row.message).toBe(declared.get(row.leaf!.param_key)?.message);
    }
  });
  it("renders category counters unavailable rather than copies of project totals", () => {
    const { container } = render(
      <CatalogTree
        tree={tree}
        techno="LTE+NR"
        needle=""
        selected={new Set()}
        onToggle={vi.fn()}
        resetTick={0}
        templates={{ categories, onCategory: vi.fn(), onLeaf: vi.fn() }}
      />,
    );
    expect(container.querySelectorAll("section")).toHaveLength(2);
    expect(container.textContent).toContain("— params · — détections");
    expect(container.textContent).toContain("Compteurs par technologie non fournis par l’API");
  });
});
