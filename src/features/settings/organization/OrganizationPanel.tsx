import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageUp, X } from "lucide-react";
import { exportMetadata, getOrganization, putOrganization } from "@/lib/api/client";
import type { Organization, OrganizationInput } from "@/lib/api/settings-schemas";
import { can } from "@/lib/permissions";
import { Logo } from "@/components/bc4/AppShell";
import { ErrorState, LoadingSkeleton } from "@/components/bc4/States";
import { Switch } from "@/components/ui/switch";
import { btn, btnPrimary, Card, errMsg, Field, inputCls, ReadOnlyNotice, SaveStatus, SettingsSection, useActor, useFormState } from "../shared";
import { useState } from "react";

export function OrganizationPanel() {
  const q = useQuery({ queryKey: ["settings", "organization"], queryFn: () => getOrganization() });
  if (q.isLoading) return <LoadingSkeleton className="h-64" />;
  if (q.isError) return <ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} />;
  return <OrgForm org={q.data!} />;
}

function OrgForm({ org }: { org: Organization }) {
  const actor = useActor();
  const qc = useQueryClient();
  const write = can(actor.role, "org.write");
  const { limits, ...persisted } = org;
  const form = useFormState<OrganizationInput>(persisted);
  const [logoErr, setLogoErr] = useState<string | null>(null);
  const d = form.draft!;
  const fe = (k: string) => (form.error?.field === k ? form.error.message : null);
  const nameErr = !d.name.trim() ? "Nom requis." : d.name.length > limits.name_max ? `${limits.name_max} caractères maximum.` : null;

  const onLogo = (f?: File) => {
    setLogoErr(null);
    if (!f) return;
    if (!limits.logo_types.includes(f.type)) return setLogoErr("Format non accepté (PNG, SVG, JPEG).");
    if (f.size > limits.logo_max_bytes) return setLogoErr(`Fichier trop volumineux (${Math.round(limits.logo_max_bytes / 1000)} Ko max).`);
    const r = new FileReader();
    r.onload = () => form.setDraft({ logo_data_url: String(r.result) });
    r.readAsDataURL(f);
  };
  const meta = exportMetadata();

  return (
    <SettingsSection title="Organisation" description="Identité de l'organisation utilisatrice. L'identité du produit BC4 reste inchangée.">
      {!write && <ReadOnlyNotice />}
      <Card title="Aperçu d'en-tête">
        <div className="flex h-12 items-center gap-3 rounded-md border bg-card px-4">
          <Logo className="text-lg" />
          {d.show_in_header && d.name.trim() ? <span className="flex items-center gap-2 border-l pl-3 text-sm font-medium text-muted-foreground">
            {d.logo_data_url && <img src={d.logo_data_url} alt="" className="h-6 w-6 rounded object-contain" />}{d.short_name || d.name}</span>
            : <span className="text-xs text-muted-foreground">{d.name.trim() ? "Nom masqué dans la barre supérieure" : "Aucune organisation configurée"}</span>}
        </div>
      </Card>
      <Card>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); form.save(async (v) => { await putOrganization(actor, v); await qc.invalidateQueries({ queryKey: ["settings"] }); }); }}>
          <Field label="Nom de l'organisation *" htmlFor="o-name" error={fe("name") ?? (form.status === "dirty" ? nameErr : null)} hint={`${d.name.length}/${limits.name_max}`}>
            <input id="o-name" className={inputCls} disabled={!write} value={d.name} maxLength={limits.name_max + 10} onChange={(e) => form.setDraft({ name: e.target.value })} placeholder="Nom fourni par l'administrateur" /></Field>
          <Field label="Nom court" htmlFor="o-short"><input id="o-short" className={inputCls} disabled={!write} value={d.short_name} onChange={(e) => form.setDraft({ short_name: e.target.value })} /></Field>
          <div className="sm:col-span-2"><Field label="Description" htmlFor="o-desc"><textarea id="o-desc" rows={2} className={`${inputCls} h-auto py-2`} disabled={!write} value={d.description} onChange={(e) => form.setDraft({ description: e.target.value })} /></Field></div>
          <Field label="Contact administrateur" htmlFor="o-contact"><input id="o-contact" type="email" className={inputCls} disabled={!write} value={d.admin_contact} onChange={(e) => form.setDraft({ admin_contact: e.target.value })} /></Field>
          <Field label="Domaine d'organisation (facultatif)" htmlFor="o-domain"><input id="o-domain" className={inputCls} disabled={!write} value={d.domain} onChange={(e) => form.setDraft({ domain: e.target.value })} placeholder="exemple.fr" /></Field>
          <Field label="Logo (PNG, SVG, JPEG · 300 Ko max)" htmlFor="o-logo" error={logoErr ?? fe("logo")}>
            <div className="flex items-center gap-2">
              {d.logo_data_url && <img src={d.logo_data_url} alt="Logo de l'organisation" className="h-10 w-10 rounded border object-contain" />}
              {write && <label className={`${btn} cursor-pointer`}><ImageUp className="h-3.5 w-3.5" />Choisir<input id="o-logo" type="file" accept={limits.logo_types.join(",")} className="sr-only" onChange={(e) => onLogo(e.target.files?.[0])} /></label>}
              {write && d.logo_data_url && <button type="button" className={btn} onClick={() => form.setDraft({ logo_data_url: null })}><X className="h-3.5 w-3.5" />Retirer</button>}
            </div></Field>
          <div className="space-y-2 text-xs">
            <label className="flex items-center gap-2"><Switch disabled={!write} checked={d.show_in_header} onCheckedChange={(v) => form.setDraft({ show_in_header: v })} />Afficher dans la barre supérieure</label>
            <label className="flex items-center gap-2"><Switch disabled={!write} checked={d.show_in_exports} onCheckedChange={(v) => form.setDraft({ show_in_exports: v })} />Afficher sur les exports</label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 sm:col-span-2">
            <SaveStatus status={form.status} error={form.error} />
            {write && <div className="flex gap-2"><button type="button" className={btn} onClick={form.reset}>Annuler</button>
              <button className={btnPrimary} disabled={form.status === "pristine" || form.status === "saving" || !!nameErr}>Enregistrer</button></div>}
          </div>
        </form>
      </Card>
      <Card title="Métadonnées d'export (enregistrées)">
        <p className="font-mono text-xs"># {meta.generator}{meta.organization ? ` — Organisation : ${meta.organization}` : ""}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">Première ligne ajoutée aux exports CSV du Dictionnaire.</p>
      </Card>
    </SettingsSection>
  );
}
