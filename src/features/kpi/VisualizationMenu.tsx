import { BarChart3, ChartNoAxesCombined, Table2, MapPin } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { VISUALIZATIONS, type VisualizationType } from "./visualization-model";
const icons = {
  histogram: BarChart3,
  graph: ChartNoAxesCombined,
  table: Table2,
  map: MapPin,
  task_series: ChartNoAxesCombined,
};
export function VisualizationItems({
  onChange,
  throughput = false,
}: {
  throughput?: boolean;
  onChange: (mode: VisualizationType) => void;
}) {
  return (
    <>
      {(Object.keys(VISUALIZATIONS) as VisualizationType[])
        .filter((mode) => mode !== "task_series" || throughput)
        .map((mode) => {
          const Icon = icons[mode];
          return (
            <DropdownMenuItem key={mode} onSelect={() => onChange(mode)}>
              <Icon size={14} />
              {VISUALIZATIONS[mode]}
            </DropdownMenuItem>
          );
        })}
      {throughput && (
        <span title="Catalogue des axes non exposé par l’API" className="block">
          <DropdownMenuItem disabled>Nuage (vs radio)</DropdownMenuItem>
        </span>
      )}
      <p className="max-w-64 px-2 py-1 text-[10px] text-muted-foreground">
        Graphique : points agrégés par groupe, sans liaison temporelle.
      </p>
    </>
  );
}
