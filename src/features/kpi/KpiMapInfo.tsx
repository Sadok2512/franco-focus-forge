import { useTranslation } from "react-i18next";
import type { ProjectKpiDetail } from "@/lib/api/project-kpi-schemas";
import { KpiMapOSM } from "./KpiMapOSM";
import { type Entry, techLabel } from "./workspace-model";

export function KpiMapInfo({
  entry,
  data,
}: {
  entry: Entry | undefined;
  data: ProjectKpiDetail | undefined;
}) {
  const { t: translate } = useTranslation();
  const fields: Record<string, unknown> = entry
    ? {
        "Code KPI": entry.item.code,
        Technologie: techLabel(entry.techno),
        Famille: entry.family,
        Nature: data?.nature ?? entry.item.nature,
        Unité: data?.unit ?? entry.item.unit,
        Formule: data?.formula ?? entry.item.formula,
        Source: data?.source ?? entry.item.source,
        Population: data?.n,
        Dénominateur: data?.["denominator"],
        result_id: data?.["result_id"],
        Statut: data?.status ?? entry.item.status,
        Raison: data?.reason ?? entry.item.reason,
      }
    : {};
  return (
    <section id="kpi-map-info" aria-label={translate("kpi.14f7a7c545f8")} className="kpi-map-info">
      <div className="min-w-0">
        <h2 className="mb-2 text-sm font-semibold">{translate("kpi.8ae525330384")}</h2>
        <KpiMapOSM />
        <p className="mt-2 text-xs text-muted-foreground"> {translate("kpi.d06f2a57cfc8")} </p>
      </div>
      <div className="min-w-0">
        <h2 className="mb-2 text-sm font-semibold">
          {" "}
          {translate("kpi.23c32c5569dc")} {entry?.item.name ?? translate("kpi.967a13eec1c9")}
        </h2>
        {entry ? (
          <dl className="kpi-info-list max-h-[310px] overflow-y-auto">
            {Object.entries(fields)
              .filter(([, value]) => value != null)
              .map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{typeof value === "object" ? JSON.stringify(value) : String(value)}</dd>
                </div>
              ))}
          </dl>
        ) : (
          <p className="text-xs text-muted-foreground">{translate("kpi.af42ea85ff28")}</p>
        )}
      </div>
    </section>
  );
}
