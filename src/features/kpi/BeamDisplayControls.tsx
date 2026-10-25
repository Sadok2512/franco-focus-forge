import { useTranslation } from "react-i18next";
import { Slider } from "@/components/ui/slider";
import { beamPercent } from "./beam-display";
import type { SitesLayerDisplay } from "./SitesLayer";

export type BeamDisplayControlProps = {
  display?: SitesLayerDisplay | undefined;
  onSetBeamDisplay?: ((key: "beamSize" | "beamIntensity", value: number) => void) | undefined;
};

export function BeamDisplayControls({ display, onSetBeamDisplay }: BeamDisplayControlProps) {
  const { t } = useTranslation();
  if (!onSetBeamDisplay) return null;
  return (
    <div className="space-y-3 py-1">
      {(["beamSize", "beamIntensity"] as const).map((key) => {
        const value = beamPercent(display?.[key], key === "beamSize" ? 50 : 28);
        const label = t(`mapWorkspace.${key}`);
        return (
          <div key={key} className="space-y-2">
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span>{label}</span><output className="shrink-0 font-semibold tabular-nums">{value} %</output>
            </div>
            <Slider aria-label={label} min={0} max={100} step={1} value={[value]}
              onValueChange={([next]) => { if (next !== undefined) onSetBeamDisplay(key, next); }} />
          </div>
        );
      })}
    </div>
  );
}