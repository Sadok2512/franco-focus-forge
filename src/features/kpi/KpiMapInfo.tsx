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
    <section id="kpi-map-info" aria-label="Carte et informations" className="kpi-map-info">
      <div className="min-w-0">
        <h2 className="mb-2 text-sm font-semibold">Carte</h2>
        <KpiMapOSM />
        <p className="mt-2 text-xs text-muted-foreground">
          Fond OpenStreetMap, vue générale de la France. Le contrat actuel ne fournit pas de
          coordonnées pour ces KPI : aucun emplacement de mesure n’est représenté.
        </p>
      </div>
      <div className="min-w-0">
        <h2 className="mb-2 text-sm font-semibold">
          Infos · {entry?.item.name ?? "Aucun KPI actif"}
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
          <p className="text-xs text-muted-foreground">Sélectionnez un KPI dans le catalogue.</p>
        )}
      </div>
    </section>
  );
}
