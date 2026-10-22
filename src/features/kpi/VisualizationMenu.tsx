import { useTranslation } from "react-i18next";
import { BarChart3, ChartNoAxesCombined, Table2, MapPin } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { VISUALIZATIONS, type VisualizationType } from "./visualization-model";
const icons = {
  chronogram: ChartNoAxesCombined,
  histogram: BarChart3,
  graph: ChartNoAxesCombined,
  table: Table2,
  map: MapPin,
  task_series: ChartNoAxesCombined,
  task_scatter: ChartNoAxesCombined,
};
export function VisualizationItems({
  onChange,
  throughput = false,
  seriesAvailable = false,
  excludeGraph = false,
}: {
  throughput?: boolean;
  seriesAvailable?: boolean;
  excludeGraph?: boolean;
  onChange: (mode: VisualizationType) => void;
}) {
  const { t: translate } = useTranslation();
  return (
    <>
      {(Object.keys(VISUALIZATIONS) as VisualizationType[])
        // 1.79.0 — Spec v2 §2 : "Graph" supprimé du menu KPI (mode exclusif
        // sur chronogram/histogram/table/map/series). Appel via excludeGraph.
        .filter((mode) => (mode !== "task_scatter" || throughput) && !(excludeGraph && mode === "graph"))
        .map((mode) => {
          const Icon = icons[mode];
          return (
            <span
              key={mode}
              title={
                mode === "task_series" && !seriesAvailable
                  ? translate("kpi.20b75fa9e2fc")
                  : undefined
              }
            >
              <DropdownMenuItem
                disabled={mode === "task_series" && !seriesAvailable}
                onSelect={() => onChange(mode)}
              >
                <Icon size={14} />
                {VISUALIZATIONS[mode]}
              </DropdownMenuItem>
            </span>
          );
        })}
      <p className="max-w-64 px-2 py-1 text-[10px] text-muted-foreground">
        {" "}
        {translate("kpi.d47bfcc9869e")}{" "}
      </p>
    </>
  );
}
