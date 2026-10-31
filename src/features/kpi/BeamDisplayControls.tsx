import { useTranslation } from "react-i18next";
import { Slider } from "@/components/ui/slider";
import { beamPercent } from "./beam-display";
import type { SitesLayerDisplay } from "./SitesLayer";
import { useMetricSize } from "./metric-display";

export type BeamDisplayControlProps = {
  display?: SitesLayerDisplay | undefined;
  onSetBeamDisplay?: ((key: "beamSize" | "beamIntensity", value: number) => void) | undefined;
};

export function BeamDisplayControls({ display, onSetBeamDisplay }: BeamDisplayControlProps) {
  const { t } = useTranslation();
  const [metricSize, setMetricSize] = useMetricSize();
  if (!onSetBeamDisplay) return null;
  return (
    <div className="space-y-3 py-1">
      {(["beamSize", "beamIntensity"] as const).map((key) => {
        const value = beamPercent(display?.[key], key === "beamSize" ? 50 : 28);
        const label = t(`mapWorkspace.${key}`);
        return (
          <div key={key} className="space-y-2">
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span>{label}</span>
              <output className="shrink-0 font-semibold tabular-nums">{value} %</output>
            </div>
            <Slider
              aria-label={label}
              min={0}
              max={100}
              step={1}
              value={[value]}
              onValueChange={([next]) => {
                if (next !== undefined) onSetBeamDisplay(key, next);
              }}
            />
          </div>
        );
      })}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span>{t("mapWorkspace.metricSize")}</span>
          <output className="shrink-0 font-semibold tabular-nums">{metricSize} %</output>
        </div>
        <Slider
          aria-label={t("mapWorkspace.metricSize")}
          min={0}
          max={100}
          step={1}
          value={[metricSize]}
          onValueChange={([next]) => {
            if (next !== undefined) setMetricSize(next);
          }}
        />
      </div>
    </div>
  );
}
