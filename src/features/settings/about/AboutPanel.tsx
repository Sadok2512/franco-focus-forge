import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getAbout } from "@/lib/api/client";
import { CHANGELOG_RAW, releaseNotes } from "@/lib/version";
import { ErrorState, LoadingSkeleton } from "@/components/bc4/States";
import { btn, Card, errMsg, Modal, SettingsSection } from "../shared";

const ENV = {
  mock: "Mock (fixtures de démonstration)",
  development: "Développement",
  production: "Production",
} as const;

export function AboutPanel() {
  const q = useQuery({ queryKey: ["settings", "about"], queryFn: () => getAbout() });
  const [log, setLog] = useState(false);
  if (q.isLoading) return <LoadingSkeleton className="h-64" />;
  if (q.isError) return <ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} />;
  const a = q.data!;
  const notes = releaseNotes(a.version);
  const rows: [string, string][] = [
    ["Application", a.app_name],
    ["Version frontend (SemVer)", `v${a.version}`],
    ["Numéro de build", a.build_number ?? "N/D"],
    ["Date de build", a.build_date ?? "N/D"],
    ["Environnement", ENV[a.environment]],
    ["Version des contrats API", a.api_contracts_version ?? "N/D"],
    ["Client API", a.api_client_status],
    ["Organisation", a.organization ?? "Non configurée"],
    ["Licence", a.license ?? "N/D"],
  ];
  return (
    <SettingsSection
      title="À propos & Version"
      description="Version de l'application BC4 — distincte de la version du catalogue KPI et de la configuration IA."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Informations">
          <dl>
            {rows.map(([k, v]) => (
              <div
                key={k}
                className="flex justify-between gap-4 border-b py-2 text-xs last:border-0"
              >
                <dt className="text-muted-foreground">{k}</dt>
                <dd
                  className="text-right font-medium"
                  data-testid={k === "Version frontend (SemVer)" ? "app-version" : undefined}
                >
                  {v}
                </dd>
              </div>
            ))}
          </dl>
          <button className={`${btn} mt-3`} onClick={() => setLog(true)}>
            Voir le changelog
          </button>
        </Card>
        <Card title={`Nouveautés de la v${a.version}`}>
          {notes.length ? (
            <ul className="list-disc space-y-1.5 pl-4 text-xs">
              {notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              Aucune entrée de changelog pour cette version.
            </p>
          )}
        </Card>
      </div>
      {log && (
        <Modal title="CHANGELOG.md" onClose={() => setLog(false)}>
          <pre className="whitespace-pre-wrap font-mono text-[11px]">{CHANGELOG_RAW}</pre>
        </Modal>
      )}
    </SettingsSection>
  );
}
