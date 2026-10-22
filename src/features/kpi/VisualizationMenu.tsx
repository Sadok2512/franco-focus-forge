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
}: {
  throughput?: boolean;
  seriesAvailable?: boolean;
  onChange: (mode: VisualizationType) => void;
}) {
  const { t: translate } = useTranslation();
  return (
    <>
      {(Object.keys(VISUALIZATIONS) as VisualizationType[])
        .filter((mode) => mode !== "task_scatter" || throughput)
        .map((mode) => {
          const Icon = icons[mode];
          // Task Time needs a series; the scatter plot needs an axis catalogue
          // the API does not expose — both stay visible but disabled and explained.
          const disabled = mode === "task_series" ? !seriesAvailable : mode === "task_scatter";
          const title = disabled
            ? mode === "task_series"
              ? translate("kpi.20b75fa9e2fc")
              : translate("kpi.9c4f0a2b6d17")
            : undefined;
          return (
            <span key={mode} title={title}>
              <DropdownMenuItem
                disabled={disabled}
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
