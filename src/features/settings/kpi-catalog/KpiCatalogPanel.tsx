import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Copy, History, Pencil, Plus, Search } from "lucide-react";
import { useState } from "react";
import { createKpi, getApiPermissions, getKpiCatalogSettings, patchKpi } from "@/lib/api/client";
import { KPI_STATUS_LABEL, type Kpi, type KpiInput, type KpiStatus } from "@/lib/api/settings-schemas";
import { can } from "@/lib/permissions";
import { ErrorState, LoadingSkeleton } from "@/components/bc4/States";
import { btn, btnPrimary, errField, errMsg, Field, fmtDate, inputCls, Modal, Pill, ReadOnlyNotice, SettingsSection, useActor } from "../shared";

const TONE: Record<KpiStatus, "muted" | "good" | "primary" | "warn"> = { draft: "warn", validated: "primary", published: "good", archived: "muted" };

export function KpiCatalogPanel() {
  const actor = useActor();
  const qc = useQueryClient();
  const perms = useQuery({ queryKey: ["settings", "perms"], queryFn: getApiPermissions });
  const q = useQuery({ queryKey: ["settings", "kpi"], queryFn: () => getKpiCatalogSettings(actor) });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<KpiStatus | "">("");
  const [edit, setEdit] = useState<{ base: Kpi | null; dup?: boolean } | null>(null);
  const [hist, setHist] = useState<Kpi | null>(null);
  const write = can(actor.role, "kpi.write", perms.data);
  const archive = useMutation({ mutationFn: (k: Kpi) => patchKpi(actor, k.code, { status: "archived" }, "Archivage"), onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", "kpi"] }) });

  const items = (q.data?.items ?? []).filter((k) => (!status || k.status === status) && `${k.code} ${k.name} ${k.family}`.toLowerCase().includes(search.toLowerCase()));
  return (
    <SettingsSection title="Catalogue KPI" description="Définitions des KPI. La formule est un texte versionné, non exécutable : le moteur de calcul n'est pas encore spécifié."
      actions={<>
        <div className="relative"><Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" aria-hidden />
          <input aria-label="Rechercher un KPI" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher…" className={`${inputCls} w-48 pl-8`} /></div>
        <select aria-label="Filtrer par statut" className={`${inputCls} w-36`} value={status} onChange={(e) => setStatus(e.target.value as KpiStatus | "")}>
          <option value="">Tous statuts</option>{(q.data?.statuses ?? []).map((s) => <option key={s} value={s}>{KPI_STATUS_LABEL[s]}</option>)}</select>
        {write && <button className={btnPrimary} onClick={() => setEdit({ base: null })}><Plus className="h-3.5 w-3.5" />Ajouter</button>}
      </>}>
      {!write && <ReadOnlyNotice />}
      <p className="rounded-md bg-warning px-3 py-2 text-xs text-warning-foreground">Format de formule à définir — calcul désactivé. Aucune valeur KPI n'est calculée dans les paramètres.</p>
      {archive.isError && <p role="alert" className="text-xs text-destructive">{errMsg(archive.error)}</p>}
      <div className="overflow-x-auto rounded-lg border bg-card">
        {q.isLoading ? <LoadingSkeleton className="h-40" /> : q.isError ? <ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} /> : (
          <table className="w-full text-xs">
            <thead className="bg-muted text-left text-muted-foreground"><tr>{["Code", "Nom", "Famille", "Techno", "Unité", "Formule (texte)", "Statut", "Version", ""].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {items.map((k) => (
                <tr key={k.code} className="border-t">
                  <td className="px-3 py-2 font-mono font-medium">{k.code}</td><td className="px-3 py-2">{k.name}</td><td className="px-3 py-2">{k.family}</td>
                  <td className="px-3 py-2">{k.tech}</td><td className="px-3 py-2">{k.unit}</td>
                  <td className="max-w-56 truncate px-3 py-2 font-mono text-[11px] text-muted-foreground" title={k.formula}>{k.formula || "—"}</td>
                  <td className="px-3 py-2"><Pill tone={TONE[k.status]}>{KPI_STATUS_LABEL[k.status]}</Pill></td><td className="px-3 py-2 font-mono">v{k.version}</td>
                  <td className="px-3 py-2"><div className="flex justify-end gap-1">
                    <button className={btn} aria-label={`Historique ${k.code}`} onClick={() => setHist(k)}><History className="h-3.5 w-3.5" /></button>
                    {write && <>
                      <button className={btn} aria-label={`Modifier ${k.code}`} onClick={() => setEdit({ base: k })}><Pencil className="h-3.5 w-3.5" /></button>
                      <button className={btn} aria-label={`Dupliquer ${k.code}`} onClick={() => setEdit({ base: k, dup: true })}><Copy className="h-3.5 w-3.5" /></button>
                      {k.status !== "archived" && <button className={btn} aria-label={`Archiver ${k.code}`} onClick={() => archive.mutate(k)}><Archive className="h-3.5 w-3.5" /></button>}
                    </>}
                  </div></td>
                </tr>
              ))}
              {!items.length && <tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">Aucun KPI.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      {hist && <Modal title={`Historique ${hist.code}`} onClose={() => setHist(null)}>
        <ol className="space-y-2 text-xs">{[...hist.history].reverse().map((h) => <li key={h.version} className="flex gap-3"><span className="font-mono">v{h.version}</span><span className="text-muted-foreground">{fmtDate(h.at)}</span><span>{h.author}</span><span>{h.change}</span></li>)}</ol>
      </Modal>}
      {edit && q.data && <KpiForm base={edit.base} dup={!!edit.dup} statuses={q.data.statuses} onClose={() => setEdit(null)} onDone={() => { setEdit(null); qc.invalidateQueries({ queryKey: ["settings", "kpi"] }); }} />}
    </SettingsSection>
  );
}

function KpiForm({ base, dup, statuses, onClose, onDone }: { base: Kpi | null; dup: boolean; statuses: KpiStatus[]; onClose: () => void; onDone: () => void }) {
  const actor = useActor();
  const creating = !base || dup;
  const [f, setF] = useState<KpiInput>({
    code: base ? (dup ? `${base.code}_COPIE` : base.code) : "", name: base ? (dup ? `${base.name} (copie)` : base.name) : "",
    description: base?.description ?? "", family: base?.family ?? "", tech: base?.tech ?? "", unit: base?.unit ?? "",
    formula: base?.formula ?? "", source_events: base?.source_events ?? [], status: dup ? "draft" : base?.status ?? "draft",
  });
  const [err, setErr] = useState<{ field: string | null; message: string } | null>(null);
  const m = useMutation({
    mutationFn: () => (creating ? createKpi(actor, f) : patchKpi(actor, base!.code, { ...f, code: undefined })),
    onSuccess: onDone, onError: (e) => setErr({ field: errField(e), message: errMsg(e) }),
  });
  const e = (k: string) => (err?.field === k ? err.message : null);
  const txt = (k: keyof KpiInput, label: string) => (
    <Field label={label} htmlFor={`k-${k}`} error={e(k)}><input id={`k-${k}`} className={inputCls} value={String(f[k] ?? "")} onChange={(x) => setF({ ...f, [k]: x.target.value })} /></Field>
  );
  return (
    <Modal title={creating ? (dup ? `Dupliquer ${base!.code}` : "Nouveau KPI") : `Modifier ${base!.code}`} onClose={onClose}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(ev) => { ev.preventDefault(); setErr(null); m.mutate(); }}>
        <Field label="Code KPI (unique)" htmlFor="k-code" error={e("code")}><input id="k-code" className={inputCls} value={f.code} disabled={!creating} onChange={(x) => setF({ ...f, code: x.target.value.toUpperCase() })} /></Field>
        {txt("name", "Nom")}{txt("family", "Catégorie / famille")}{txt("tech", "Technologie")}{txt("unit", "Unité")}
        <Field label="Statut" htmlFor="k-status"><select id="k-status" className={inputCls} value={f.status} onChange={(x) => setF({ ...f, status: x.target.value as KpiStatus })}>{statuses.map((s) => <option key={s} value={s}>{KPI_STATUS_LABEL[s]}</option>)}</select></Field>
        <div className="sm:col-span-2">{txt("description", "Description")}</div>
        <div className="sm:col-span-2"><Field label="Formule (texte non exécutable)" htmlFor="k-formula" hint="Format de formule à définir — stockée telle quelle, jamais évaluée.">
          <textarea id="k-formula" rows={3} className={`${inputCls} h-auto py-2 font-mono`} value={f.formula} onChange={(x) => setF({ ...f, formula: x.target.value })} /></Field></div>
        <div className="sm:col-span-2"><Field label="Événements sources (séparés par des virgules, facultatif)" htmlFor="k-ev">
          <input id="k-ev" className={inputCls} value={f.source_events.join(", ")} onChange={(x) => setF({ ...f, source_events: x.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} /></Field></div>
        <div className="flex items-center justify-between gap-2 pt-2 sm:col-span-2">
          <button type="button" className={btn} disabled title="Moteur de formule non spécifié">Calculer (désactivé)</button>
          {err && !err.field && <p role="alert" className="text-xs text-destructive">{err.message}</p>}
          <div className="flex gap-2"><button type="button" className={btn} onClick={onClose}>Annuler</button><button className={btnPrimary} disabled={m.isPending}>Enregistrer</button></div>
        </div>
      </form>
    </Modal>
  );
}
