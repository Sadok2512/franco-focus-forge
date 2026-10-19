import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { VisualizationItems } from "@/features/kpi/VisualizationMenu";
import { taskQuery, AnalyticsSchema, TaskListSchema } from "@/lib/api/task-analytics";
import { taskPointsCsv } from "@/features/kpi/task-series-model";
import evidence from "../../audit/bc2-lot-c/api-details.json";

describe("Task Time — contrat et points live TEST2", () => {
  it("répète les filtres et ne transmet pas group_by", () => {
    const params = new URLSearchParams(
      taskQuery(
        { operator: ["Orange", "Free"], rat: ["LTE"], band: ["B3"], group_by: "operator_band" },
        "TEST-task",
      ),
    );
    expect(params.getAll("operator")).toEqual(["Orange", "Free"]);
    expect(params.get("rat")).toBe("LTE");
    expect(params.get("task_id")).toBe("TEST-task");
    expect(params.has("group_by")).toBe(false);
  });
  it("accepte tâches incomplètes et motifs de la réponse live", () => {
    const result = evidence.responses.find((r) => r.url.includes("/tasks?"))!;
    const parsed = TaskListSchema.parse(result.body);
    expect(parsed.tasks.some((t) => t.status === "incomplete" && t.reason)).toBe(true);
  });
  it("CSV conserve exactement chaque point, y compris les nulls et l’identité serveur", () => {
    const responses = evidence.responses
      .filter((r) => r.url.includes("/series?") && r.status === 200)
      .map((r) => AnalyticsSchema.parse(r.body));
    expect(responses.length).toBeGreaterThan(0);
    for (const result of responses) {
      const csv = taskPointsCsv([result]).split("\r\n");
      expect(csv.length).toBe(result.points.length + 1);
      result.points.forEach((point, index) => {
        expect(csv[index + 1]).toContain(`"${result.result_id}"`);
        expect(csv[index + 1]).toContain(`"${point.t_rel_s ?? ""}"`);
        expect(csv[index + 1]).toContain(`"${point.value ?? ""}"`);
      });
    }
  });
  it("Nuage est visible, désactivé et expliqué faute de catalogue d’axes", () => {
    render(
      <DropdownMenu open>
        <DropdownMenuTrigger>Vues</DropdownMenuTrigger>
        <DropdownMenuContent>
          <VisualizationItems throughput onChange={() => {}} />
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    const menu = screen.getByRole("menuitem", { name: "Nuage (vs radio)" });
    expect(menu).toHaveAttribute("aria-disabled", "true");
    expect(menu.parentElement).toHaveAttribute("title", "Catalogue des axes non exposé par l’API");
    expect(screen.getByRole("menuitem", { name: "Série (Task Time)" })).toBeInTheDocument();
  });
});
