import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TreePanel } from "@/features/dict-v2/TreePanel";
import { dictTreeQuery } from "@/lib/analytics-bootstrap";

const props = {
  techno: "LTE+NR" as const,
  catalog: null,
  raw: null,
  selected: new Set<string>(),
  onToggle: vi.fn(),
  onToggleCatalog: vi.fn(),
  onInfo: vi.fn(),
  onReset: vi.fn(),
  resetTick: 0,
  categories: [],
  onTemplateLeaf: vi.fn(),
  onCategory: vi.fn(),
  templatesLoading: false,
  templatesError: false,
  templateCatalog: null,
  onViewChange: vi.fn(),
};

describe("KPI Parameters reuses Dictionary components", () => {
  it("hides Templates only when requested and keeps the Dictionary default", () => {
    const view = render(<TreePanel {...props} showTemplates={false} />);
    expect(screen.getByRole("tab", { name: "Paramètres" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Raw parameter" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Templates" })).not.toBeInTheDocument();

    view.rerender(<TreePanel {...props} />);
    expect(screen.getByRole("tab", { name: "Templates" })).toBeInTheDocument();
  });

  it("uses exactly the same React Query key on both pages", () => {
    expect(dictTreeQuery("project", "catalog").queryKey).toEqual([
      "dict-v2",
      "tree",
      "project",
      "catalog",
      "",
    ]);
    expect(dictTreeQuery("project", "raw").queryKey).toEqual([
      "dict-v2",
      "tree",
      "project",
      "raw",
      "",
    ]);
  });
});
