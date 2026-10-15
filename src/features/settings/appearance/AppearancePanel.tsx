import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getAppearance, HEX_RE, putAppearance } from "@/lib/api/client";
import { applyAppearance, contrast, DEFAULT_PREFS, onColor, PALETTE, readPrefs, writePrefs, type Prefs } from "@/lib/appearance";
import { can } from "@/lib/permissions";
import { OpBadge } from "@/components/bc4/AppShell";
import { btn, btnPrimary, Card, errMsg, inputCls, SettingsSection, useActor } from "../shared";

export function AppearancePanel() {
  const actor = useActor();
  const qc = useQueryClient();
  const org = useQuery({ queryKey: ["settings", "appearance"], queryFn: () => getAppearance() });
  const [saved, setSaved] = useState<Prefs>(DEFAULT_PREFS);
  const [draft, setDraft] = useState<Prefs>(DEFAULT_PREFS);
  const [hexInput, setHexInput] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { const p = readPrefs(); setSaved(p); setDraft(p); setHexInput(p.primary_hex ?? ""); }, []);
  const orgHex = org.data?.org_primary_hex ?? null;
  // live preview; restored on unmount if not applied
  useEffect(() => { applyAppearance(draft, orgHex); }, [draft, orgHex]);
  useEffect(() => () => applyAppearance(readPrefs(), qc.getQueryData<{ org_primary_hex: string | null }>(["settings", "appearance"])?.org_primary_hex ?? null), [qc]);
  const orgSave = useMutation({ mutationFn: (hex: string | null) => putAppearance(actor, { org_primary_hex: hex }), onSuccess: () => { setMsg("Thème d'organisation enregistré (mock)."); qc.invalidateQueries({ queryKey: ["settings", "appearance"] }); }, onError: (e) => setMsg(errMsg(e)) });

  const hex = draft.primary_hex;
  const hexValid = !hexInput || HEX_RE.test(hexInput);
  const on = hex ? onColor(hex) : null;
  const vsBg = hex ? contrast(hex, "#FFFFFF") : null;
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  return (
    <SettingsSection title="Apparence" description="Préférences personnelles (ce navigateur) et thème d'organisation. Les couleurs des opérateurs ne sont jamais remplacées.">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Préférences personnelles">
          <fieldset className="mb-4"><legend className="mb-1.5 text-xs font-medium">Thème</legend>
            <div className="flex gap-2">{(["light", "dark", "system"] as const).map((m) => (
              <label key={m} className={`${btn} ${draft.mode === m ? "border-primary ring-1 ring-primary" : ""}`}>
                <input type="radio" name="mode" className="sr-only" checked={draft.mode === m} onChange={() => setDraft({ ...draft, mode: m })} />{{ light: "Clair", dark: "Sombre", system: "Système" }[m]}</label>))}</div></fieldset>
          <fieldset className="mb-4"><legend className="mb-1.5 text-xs font-medium">Densité</legend>
            <div className="flex gap-2">{(["compact", "comfortable"] as const).map((m) => (
              <label key={m} className={`${btn} ${draft.density === m ? "border-primary ring-1 ring-primary" : ""}`}>
                <input type="radio" name="density" className="sr-only" checked={draft.density === m} onChange={() => setDraft({ ...draft, density: m })} />{m === "compact" ? "Compacte" : "Confortable"}</label>))}</div></fieldset>
          <fieldset><legend className="mb-1.5 text-xs font-medium">Couleur principale</legend>
            <div className="mb-2 flex flex-wrap gap-2">
              {PALETTE.map((c) => <button key={c} type="button" aria-label={`Couleur ${c}`} aria-pressed={hex === c} onClick={() => { setDraft({ ...draft, primary_hex: c }); setHexInput(c); }}
                className={`h-7 w-7 rounded-full border-2 ${hex === c ? "border-foreground" : "border-transparent"}`} style={{ background: c }} />)}
              <button type="button" className={btn} onClick={() => { setDraft({ ...draft, primary_hex: null }); setHexInput(""); }}>Par défaut{orgHex ? " (organisation)" : ""}</button>
            </div>
            <label htmlFor="hex" className="text-[11px] text-muted-foreground">Saisie HEX</label>
            <input id="hex" className={`${inputCls} w-32 font-mono`} value={hexInput} placeholder="#1F5FD6" aria-invalid={!hexValid}
              onChange={(e) => { const v = e.target.value.trim(); setHexInput(v); if (HEX_RE.test(v)) setDraft({ ...draft, primary_hex: v.toUpperCase() }); }} />
            {!hexValid && <p role="alert" className="text-[11px] text-destructive">Format attendu : #RRGGBB.</p>}
            {on && vsBg !== null && (
              <p role="status" className={`mt-2 text-[11px] ${on.ratio < 4.5 || vsBg < 3 ? "text-destructive" : "text-sev-good"}`}>
                Contraste texte/bouton {on.ratio.toFixed(1)}:1 · sur fond clair {vsBg.toFixed(1)}:1 {on.ratio < 4.5 || vsBg < 3 ? "— ⚠ accessibilité insuffisante (min. 4,5:1 texte, 3:1 éléments)" : "— ✓ conforme"}
              </p>
            )}
          </fieldset>
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
            <span className="mr-auto text-xs text-muted-foreground" role="status">{dirty ? "Aperçu en direct — non appliqué" : "Préférences appliquées"}</span>
            <button className={btn} onClick={() => { setDraft({ ...draft, primary_hex: null }); setHexInput(""); }}>Réinitialiser les couleurs</button>
            <button className={btn} disabled={!dirty} onClick={() => { setDraft(saved); setHexInput(saved.primary_hex ?? ""); }}>Annuler</button>
            <button className={btnPrimary} disabled={!dirty} onClick={() => { writePrefs(draft); setSaved(draft); }}>Appliquer</button>
          </div>
        </Card>
        <Card title="Aperçu">
          <div className="space-y-4">
            <div className="flex gap-2"><button className={btnPrimary}>Bouton principal</button><button className={btn}>Secondaire</button></div>
            <div className="flex gap-1 rounded-md border p-1 text-xs"><span className="rounded bg-primary px-3 py-1.5 text-primary-foreground">Onglet actif</span><span className="px-3 py-1.5">Onglet</span></div>
            <div className="flex h-20 items-end gap-2 rounded-md border p-2" aria-label="Graphique neutre d'exemple" role="img">
              {[40, 70, 55, 85, 30].map((h, i) => <span key={i} className="flex-1 rounded-t bg-primary/70" style={{ height: `${h}%` }} />)}</div>
            <div className="rounded-md border bg-muted p-3 text-xs">Panneau · <a className="text-primary underline">lien</a></div>
            <div className="flex gap-1.5"><OpBadge op="Orange" /><OpBadge op="SFR" /><OpBadge op="Bouygues" /><OpBadge op="Free" /><span className="text-[11px] text-muted-foreground">couleurs opérateurs préservées</span></div>
          </div>
        </Card>
      </div>
      <Card title="Thème d'organisation">
        <p className="mb-2 text-xs text-muted-foreground">Couleur par défaut pour tous les utilisateurs (une préférence personnelle la remplace). Actuelle : <span className="font-mono">{orgHex ?? "défaut BC4"}</span></p>
        {can(actor.role, "appearance.org.write") ? (
          <div className="flex gap-2">
            <button className={btnPrimary} disabled={!hex || orgSave.isPending} onClick={() => orgSave.mutate(hex)}>Définir {hex ?? "—"} pour l'organisation</button>
            <button className={btn} disabled={!orgHex} onClick={() => orgSave.mutate(null)}>Rétablir le défaut BC4</button>
          </div>
        ) : <p className="text-xs text-muted-foreground">Réservé à l'administrateur.</p>}
        {msg && <p role="status" className="mt-2 text-xs">{msg}</p>}
      </Card>
    </SettingsSection>
  );
}
