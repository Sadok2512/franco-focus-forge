import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileUp, MapPinOff } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { getApiPermissions, getGeoReferences, postGeoImport, validateGeo } from "@/lib/api/client";
import { GEO_FIELDS, type GeoImportReport, type GeoMapping } from "@/lib/api/settings-schemas";
import { can } from "@/lib/permissions";
import { ErrorState, LoadingSkeleton } from "@/components/bc4/States";
import {
  btn,
  btnPrimary,
  Card,
  downloadText,
  errMsg,
  fmtDate,
  Forbidden,
  inputCls,
  Pill,
  ReadOnlyNotice,
  SettingsSection,
  useActor,
} from "../shared";
import { parseFile, suggestMapping, type Table } from "./parse";

const GeoPreviewMap = lazy(() =>
  import("./GeoPreviewMap").then((m) => ({ default: m.GeoPreviewMap })),
);

export function reportCsv(rep: Pick<GeoImportReport, "issues">) {
  return [
    "ligne;niveau;champ;message",
    ...rep.issues.map((i) =>
      [
        i.row ?? "—",
        i.level === "error" ? "erreur" : "avertissement",
        i.field ?? "",
        `"${i.message.replace(/"/g, '""')}"`,
      ].join(";"),
    ),
  ].join("\n");
}

export function GeographyPanel() {
  const actor = useActor();
  const qc = useQueryClient();
  const perms = useQuery({ queryKey: ["settings", "perms"], queryFn: getApiPermissions });
  const refs = useQuery({
    queryKey: ["settings", "geo"],
    queryFn: () => getGeoReferences(actor),
    enabled: can(actor.role, "geo.read"),
  });
  const [file, setFile] = useState<File | null>(null);
  const [table, setTable] = useState<Table | null>(null);
  const [parseErr, setParseErr] = useState<string | null>(null);
  const [mapping, setMapping] = useState<GeoMapping>({});
  const [done, setDone] = useState<string | null>(null);
  const write = can(actor.role, "geo.write", perms.data);
  const imp = useMutation({
    mutationFn: () =>
      postGeoImport(actor, { filename: file!.name, mapping, rows: table!.rows, commit: true }),
    onSuccess: (r) => {
      setDone(`Référentiel v${r.committed?.version} importé (${r.valid} lignes).`);
      setTable(null);
      setFile(null);
      qc.invalidateQueries({ queryKey: ["settings", "geo"] });
    },
  });

  if (!can(actor.role, "geo.read")) return <Forbidden />;
  const report = table ? validateGeo({ mapping, rows: table.rows }) : null;

  const onFile = async (f: File | undefined) => {
    setParseErr(null);
    setDone(null);
    setTable(null);
    imp.reset();
    if (!f) return;
    try {
      const t = await parseFile(f);
      setFile(f);
      setTable(t);
      setMapping(suggestMapping(t.columns));
    } catch (e) {
      setParseErr(errMsg(e));
    }
  };

  return (
    <SettingsSection
      title="Géographie"
      description="Importer un référentiel de zones (Plaque › DR › Département › Site › Point). Le mapping des colonnes reste à valider : aucun schéma définitif n'est imposé."
    >
      {!write && (
        <ReadOnlyNotice>
          Lecture seule : l'import nécessite une permission explicite.
        </ReadOnlyNotice>
      )}
      {write && (
        <Card title="1. Fichier">
          <label className={`${btn} cursor-pointer`}>
            <FileUp className="h-3.5 w-3.5" />
            Choisir un fichier CSV ou XLSX
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              className="sr-only"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </label>
          {file && (
            <span className="ml-2 text-xs text-muted-foreground">
              {file.name} — {table?.rows.length ?? 0} lignes, {table?.columns.length ?? 0} colonnes
            </span>
          )}
          {parseErr && (
            <p role="alert" className="mt-2 text-xs text-destructive">
              {parseErr}
            </p>
          )}
        </Card>
      )}
      {done && (
        <p role="status" className="rounded-md bg-accent px-3 py-2 text-xs text-accent-foreground">
          {done}
        </p>
      )}
      {table && report && (
        <>
          <Card title="2. Mapping des colonnes">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {GEO_FIELDS.map((f) => (
                <label key={f.key} className="space-y-1 text-xs">
                  <span className="font-medium">
                    {f.label}
                    {f.required ? " *" : ""}
                  </span>
                  <select
                    className={inputCls}
                    value={mapping[f.key] ?? ""}
                    onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value || null })}
                  >
                    <option value="">— non mappé —</option>
                    {table.columns.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              * obligatoire selon le contrat mock v0.1.0 (à figer).
            </p>
          </Card>
          <Card title="3. Validation">
            <div className="mb-3 flex flex-wrap gap-2 text-xs">
              <Pill tone="good">✓ {report.valid} valides</Pill>
              <Pill tone="bad">✕ {report.rejected} rejetées</Pill>
              <Pill tone="warn">! {report.warnings} avertissements</Pill>
              <button
                className={btn}
                disabled={!report.issues.length}
                onClick={() =>
                  downloadText(`rapport_${file?.name ?? "import"}.csv`, reportCsv(report))
                }
              >
                <Download className="h-3.5 w-3.5" />
                Rapport d'erreurs
              </button>
              <button
                className={btnPrimary}
                disabled={!report.valid || imp.isPending}
                onClick={() => imp.mutate()}
              >
                {imp.isPending ? "Import…" : `Importer ${report.valid} lignes`}
              </button>
            </div>
            {imp.isError && (
              <p role="alert" className="mb-2 text-xs text-destructive">
                {errMsg(imp.error)}
              </p>
            )}
            {report.issues.length > 0 && (
              <div className="max-h-48 overflow-auto rounded border">
                <table className="w-full text-xs">
                  <tbody>
                    {report.issues.slice(0, 200).map((i, k) => (
                      <tr key={k} className="border-t first:border-0">
                        <td className="w-16 px-2 py-1 font-mono">{i.row ?? "—"}</td>
                        <td className="w-28 px-2 py-1">
                          {i.level === "error" ? (
                            <Pill tone="bad">Erreur</Pill>
                          ) : (
                            <Pill tone="warn">Avertissement</Pill>
                          )}
                        </td>
                        <td className="px-2 py-1">{i.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Aperçu (10 premières lignes)">
              <div className="overflow-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr>
                      {table.columns.map((c) => (
                        <th
                          key={c}
                          className="px-2 py-1 text-left font-medium text-muted-foreground"
                        >
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.slice(0, 10).map((r, i) => (
                      <tr key={i} className="border-t">
                        {table.columns.map((c) => (
                          <td key={c} className="px-2 py-1">
                            {r[c] || "N/D"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <Card title="Carte">
              {report.points.length ? (
                <Suspense fallback={<LoadingSkeleton className="h-64" />}>
                  <GeoPreviewMap points={report.points} />
                </Suspense>
              ) : (
                <div className="flex h-64 flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
                  <MapPinOff className="h-5 w-5" />
                  Coordonnées indisponibles
                </div>
              )}
            </Card>
          </div>
        </>
      )}
      <Card title="Référentiels versionnés">
        {refs.isLoading ? (
          <LoadingSkeleton className="h-16" />
        ) : refs.isError ? (
          <ErrorState message={errMsg(refs.error)} onRetry={() => refs.refetch()} />
        ) : (
          <table className="w-full text-xs">
            <thead className="text-left text-muted-foreground">
              <tr>
                {["Version", "Fichier", "Importé le", "Auteur", "Lignes", "Statut"].map((h) => (
                  <th key={h} className="py-1 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {refs.data!.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="py-1.5 font-mono">v{r.version}</td>
                  <td>{r.filename}</td>
                  <td>{fmtDate(r.imported_at)}</td>
                  <td>{r.author}</td>
                  <td className="font-mono">{r.rows || "N/D"}</td>
                  <td>
                    <Pill tone={r.status === "active" ? "good" : "muted"}>
                      {r.status === "active" ? "Actif" : "Archivé"}
                    </Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </SettingsSection>
  );
}
