import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { NmfImportReport } from "@/lib/api/nmf-schemas";
import { Card, nd, ndPct } from "./shared";

function Breakdown({
  entries,
  emptyLabel,
}: {
  entries: Array<[string, number]>;
  emptyLabel: string;
}) {
  if (!entries.length) return <p className="text-xs text-muted-foreground">{emptyLabel}</p>;
  return (
    <ul className="divide-y rounded border bg-background text-xs">
      {entries.map(([k, n]) => (
        <li key={k} className="flex items-center justify-between px-3 py-1.5">
          <span className="truncate pr-2">{k}</span>
          <span className="font-mono">{nd(n)}</span>
        </li>
      ))}
    </ul>
  );
}

export function NmfImportReportView({ report }: { report: NmfImportReport }) {
  const operators = Object.entries(report.operators_seen).sort((a, b) => b[1] - a[1]);
  const technos = Object.entries(report.technos_seen).sort((a, b) => b[1] - a[1]);
  const errored = report.by_file.filter((f) => f.status === "error");

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Fichiers reçus">
          <p className="text-xl font-semibold">{nd(report.files_received)}</p>
          <p className="text-[11px] text-muted-foreground">
            {nd(report.files_done)} ok · {nd(report.files_error)} en échec
          </p>
        </Card>
        <Card title="Captures décodées">
          <p className="text-xl font-semibold text-sev-good">{nd(report.n_captures)}</p>
          <p className="text-[11px] text-muted-foreground">messages radio exploitables</p>
        </Card>
        <Card title="Événements">
          <p className="text-xl font-semibold">{nd(report.n_events)}</p>
          <p className="text-[11px] text-muted-foreground">RRC / NAS / handovers</p>
        </Card>
        <Card title="Couverture GPS">
          <p className="text-xl font-semibold">{ndPct(report.gps_coverage_pct)}</p>
          <p className="text-[11px] text-muted-foreground">
            Captures avec fix GPS valide ·{" "}
            <span className="italic">
              {report.gps_coverage_pct === null
                ? "indoor pur ou GPS absent — non confondu avec 0 %"
                : "ratio capté sur l'ensemble des captures"}
            </span>
          </p>
        </Card>
      </div>

      {errored.length > 0 && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" aria-hidden />
          <div className="space-y-1">
            <p className="font-semibold text-destructive">
              Fichiers en échec ({nd(errored.length)}) — message brut du décodeur
            </p>
            <ul className="space-y-1">
              {errored.map((f) => (
                <li key={f.filename} className="font-mono text-destructive/90">
                  <span className="font-semibold">{f.filename}</span>
                  {" — "}
                  <span>{f.error_msg ?? "cause non précisée"}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <Card title="Opérateurs vus">
          <Breakdown entries={operators} emptyLabel="Aucun opérateur détecté." />
        </Card>
        <Card title="Technologies vues">
          <Breakdown entries={technos} emptyLabel="Aucune techno détectée." />
        </Card>
      </div>

      <Card title="Détail par fichier">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead className="bg-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Fichier</th>
                <th className="px-3 py-2">Statut</th>
                <th className="px-3 py-2 text-right">Captures</th>
                <th className="px-3 py-2 text-right">Événements</th>
                <th className="px-3 py-2 text-right">GPS</th>
                <th className="px-3 py-2">Décodeur</th>
                <th className="px-3 py-2">Erreur</th>
              </tr>
            </thead>
            <tbody>
              {report.by_file.map((f) => {
                const ok = f.status === "done";
                const err = f.status === "error";
                return (
                  <tr key={f.filename} className="border-t">
                    <td className="px-3 py-2 font-medium">{f.filename}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          ok
                            ? "bg-sev-good/15 text-sev-good"
                            : err
                              ? "bg-destructive/10 text-destructive"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {ok ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : err ? (
                          <AlertTriangle className="h-3 w-3" />
                        ) : null}
                        {f.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{nd(f.n_captures)}</td>
                    <td className="px-3 py-2 text-right font-mono">{nd(f.n_events)}</td>
                    <td className="px-3 py-2 text-right font-mono">{nd(f.n_gps)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{f.decoder_version}</td>
                    <td className="px-3 py-2 text-destructive">{f.error_msg ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
