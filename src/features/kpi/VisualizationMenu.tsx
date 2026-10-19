import { BarChart3, ChartNoAxesCombined, Table2, MapPin } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { VISUALIZATIONS, type VisualizationType } from "./visualization-model";
const icons = { histogram: BarChart3, graph: ChartNoAxesCombined, table: Table2, map: MapPin };
export function VisualizationItems({ onChange }: { onChange: (mode: VisualizationType) => void }) {
  return (
    <>
      {(Object.keys(VISUALIZATIONS) as VisualizationType[]).map((mode) => {
        const Icon = icons[mode];
        return (
          <DropdownMenuItem key={mode} onSelect={() => onChange(mode)}>
            <Icon size={14} />
            {VISUALIZATIONS[mode]}
          </DropdownMenuItem>
        );
      })}
      <p className="max-w-64 px-2 py-1 text-[10px] text-muted-foreground">
        Graphique : points agrégés par groupe, sans liaison temporelle.
      </p>
    </>
  );
}
