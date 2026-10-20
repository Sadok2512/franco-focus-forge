import { describe, it, expect } from "vitest";
import { categoryTree, templateLeaves, templateRows } from "./template-model";
import { identifyTrees } from "./parameter-identity";
import type { DictTreeResponse } from "@/lib/api/dict-v2";
import type { TemplateCategory } from "@/lib/api/dict-templates";
const category: TemplateCategory = {
  id: "TEST-category",
  label: "TEST Category",
  position: 1,
  revision: 1,
  n_parameters: 1,
  n_in_project: 7,
  entries: [
    {
      id: "TEST-entry",
      label: "TEST duplicate name",
      position: 1,
      technology: "LTE",
      parameters: [
        { technology: "LTE", param_key: "TEST/a/value", discriminators: { mode: "TEST-AM" } },
      ],
      discriminators: {},
      reason: null,
      resolved: true,
      n_in_project: 7,
    },
  ],
};
const tree: DictTreeResponse = {
  project_id: "TEST-project",
  view: "catalog",
  distinct_param_keys: 3,
  total_rows: 20,
  tree: ["LTE", "NR"].map((techno) => ({
    techno,
    origins: [
      {
        origin: "network_config",
        messages: [
          {
            message: "TEST-message",
            groups: [
              {
                name: "TEST-group",
                kpis: [
                  {
                    param_key: "TEST/a/value",
                    display_name: "TEST duplicate name",
                    n: 7,
                    category_id: "TEST-category",
                    discriminators: { mode: "TEST-AM" },
                  },
                  {
                    param_key: "TEST/b/value",
                    display_name: "TEST duplicate name",
                    n: 3,
                    category_id: "TEST-other",
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  })),
};
describe("API template identity", () => {
  it("selects exact technology, key and discriminator, never display name", () => {
    const identified = identifyTrees(tree, null).catalog;
    const leaves = templateLeaves(identified, category);
    expect(leaves).toHaveLength(1);
    expect(leaves[0]?.["technology"]).toBe("LTE");
    expect(leaves[0]?.param_key).toBe("TEST/a/value");
    expect(
      templateLeaves(identified, {
        ...category,
        entries: category.entries.map((e) => ({
          ...e,
          parameters: e.parameters.map((r) => ({ ...r, discriminators: { mode: "TEST-UM" } })),
        })),
      }),
    ).toEqual([]);
  });
  it("filters by server category ID, retains source counts and leaves the full tree unchanged", () => {
    const filtered = categoryTree(tree, category)!;
    expect(filtered.total_rows).toBe(7);
    expect(filtered.tree[0]?.origins[0]?.messages[0]?.groups[0]?.kpis).toHaveLength(1);
    expect(tree.tree[0]?.origins[0]?.messages[0]?.groups[0]?.kpis).toHaveLength(2);
    expect(categoryTree(tree, null)).toBe(tree);
  });
  it("keeps empty metadata categories valid with an empty tree", () => {
    expect(
      categoryTree(tree, { ...category, id: "TEST-empty", n_parameters: 0, n_in_project: 0 })?.tree,
    ).toEqual([]);
  });
});

describe("template missing references", () => {
  it("keeps an absent zero-count template parameter visible without inventing a message", () => {
    const zero = { ...category, entries: category.entries.map((e) => ({ ...e, n_in_project: 0 })) };
    const rows = templateRows(null, zero, "LTE");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      n: 0,
      message: null,
      leaf: null,
      discriminators: { mode: "TEST-AM" },
    });
    expect(templateRows(null, zero, "NR")).toEqual([]);
  });
  it("does not distribute a positive entry population onto unresolved parameters", () => {
    expect(templateRows(null, category, "LTE")[0]?.n).toBeNull();
    const pending = {
      ...category,
      entries: category.entries.map((e) => ({ ...e, n_in_project: null })),
    };
    expect(templateRows(null, pending, "LTE")[0]?.n).toBeNull();
  });
});
