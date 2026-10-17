import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlugZap, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { getLlmSettings, putLlmSettings, testLlmConnection } from "@/lib/api/llm";
import {
  LlmProviderOptions,
  type LlmSettings,
  type LlmSettingsInput,
  type LlmTestResult,
} from "@/lib/api/llm-schemas";
import { can } from "@/lib/permissions";
import { ErrorState, LoadingSkeleton } from "@/components/bc4/States";
import { Switch } from "@/components/ui/switch";
import {
  btn,
  btnPrimary,
  Card,
  errMsg,
  Field,
  fmtDate,
  Forbidden,
  inputCls,
  Pill,
  ReadOnlyNotice,
  SettingsSection,
  useActor,
} from "../shared";

// -------------------------------------------------------------------
// Panneau Config LLM — appel RÉEL à /settings/llm (bc4-back 0.17.0+).
//
// La clé secrète n'est JAMAIS :
//   - stockée dans localStorage (champ `useState` uniquement, effacé
//     après PUT)
//   - renvoyée par le back (le back expose seulement `api_key_set: bool`)
//   - affichée en entrée (input type="password", autoComplete="off")
//
// `api_key: ""` lors d'un PUT ⇒ efface la clé stockée.
// `api_key: undefined` ⇒ ne touche pas la clé stockée.
// -------------------------------------------------------------------

type Draft = {
  provider: string;
  base_url: string;
  model: string;
  enabled: boolean;
  temperature: number | null;
  max_tokens: number | null;
};

function toDraft(s: LlmSettings): Draft {
  return {
    provider: s.provider,
    base_url: s.base_url,
    model: s.model,
    enabled: s.enabled,
    temperature: s.temperature,
    max_tokens: s.max_tokens,
  };
}

function urlLooksValid(u: string): { ok: boolean; https: boolean; message?: string } {
  if (!u) return { ok: false, https: false, message: "URL requise." };
  try {
    const url = new URL(u);
    if (url.protocol !== "http:" && url.protocol !== "https:")
      return { ok: false, https: false, message: "Protocole http(s) requis." };
    return { ok: true, https: url.protocol === "https:" };
  } catch {
    return { ok: false, https: false, message: "URL invalide." };
  }
}

export function LlmConfigPanel() {
  const actor = useActor();
  const canRead = can(actor.role, "ai.read");
  const q = useQuery({
    queryKey: ["settings", "llm"],
    queryFn: getLlmSettings,
    enabled: canRead,
    retry: false,
  });
  if (!canRead) return <Forbidden />;
  if (q.isLoading) return <LoadingSkeleton className="h-64" />;
  if (q.isError) return <ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} />;
  return <LlmForm cfg={q.data!} />;
}

function LlmForm({ cfg }: { cfg: LlmSettings }) {
  const actor = useActor();
  const qc = useQueryClient();
  const write = can(actor.role, "ai.write");

  const [draft, setDraft] = useState<Draft>(() => toDraft(cfg));
  const [secret, setSecret] = useState(""); // in-memory only
  const [secretTouched, setSecretTouched] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [testResult, setTestResult] = useState<LlmTestResult | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const body: LlmSettingsInput = {
        provider: draft.provider,
        base_url: draft.base_url,
        model: draft.model,
        enabled: draft.enabled,
        temperature: draft.temperature,
        max_tokens: draft.max_tokens,
      };
      // 1.11.1 — Clé API : NE JAMAIS envoyer `api_key: ""` depuis
      // « Enregistrer ». Un champ vide = pas de changement (préserve la
      // clé stockée). Pour effacer explicitement, utiliser le bouton
      // dédié « Effacer la clé stockée » (clearKey.mutate ci-dessous).
      // Avant 1.11.1 : si l'utilisateur touchait le champ puis l'effaçait
      // avant de cliquer Enregistrer, la clé stockée était silencieusement
      // nettoyée — faux positif « Enregistré » qui laissait le back en
      // config incomplète. Fix de surprise : Enregistrer ne détruit rien.
      const trimmed = secret.trim();
      if (secretTouched && trimmed.length > 0) {
        body.api_key = trimmed;
      }
      return putLlmSettings(body);
    },
    onSuccess: async (fresh) => {
      setDraft(toDraft(fresh));
      setSecret("");
      setSecretTouched(false);
      setDirty(false);
      setTestResult(null);
      await qc.invalidateQueries({ queryKey: ["settings", "llm"] });
    },
  });

  // 1.11.1 — Effacement explicite de la clé stockée. Toujours confirmer.
  const clearKey = useMutation({
    mutationFn: () => putLlmSettings({ api_key: "" }),
    onSuccess: async () => {
      setSecret("");
      setSecretTouched(false);
      setTestResult(null);
      await qc.invalidateQueries({ queryKey: ["settings", "llm"] });
    },
  });

  const test = useMutation({
    mutationFn: testLlmConnection,
    onSuccess: (r) => setTestResult(r),
  });

  const patch = (p: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...p }));
    setDirty(true);
    setTestResult(null);
  };
  const touchSecret = (v: string) => {
    setSecret(v);
    setSecretTouched(true);
    setDirty(true);
    setTestResult(null);
  };
  const reset = () => {
    setDraft(toDraft(cfg));
    setSecret("");
    setSecretTouched(false);
    setDirty(false);
    setTestResult(null);
  };

  const u = urlLooksValid(draft.base_url);
  const canSave =
    write && dirty && !!draft.provider && !!draft.model.trim() && (!draft.enabled || u.ok);

  return (
    <SettingsSection
      title="Assistant LLM"
      description="Fournisseur, modèle et clé API utilisés par l'Assistant. Les réglages sont persistés côté serveur ; la clé est chiffrée au repos (Fernet) et n'est jamais renvoyée en clair."
    >
      {!write && <ReadOnlyNotice />}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <p className="text-[11px] text-muted-foreground">Dernière mise à jour</p>
          <p className="mt-1 text-sm font-semibold">{fmtDate(cfg.updated_at)}</p>
        </Card>
        <Card>
          <p className="text-[11px] text-muted-foreground">Assistant activé</p>
          <p className="mt-1">
            <Pill tone={cfg.enabled ? "good" : "muted"}>{cfg.enabled ? "● Oui" : "○ Non"}</Pill>
          </p>
        </Card>
        <Card>
          <p className="text-[11px] text-muted-foreground">Clé API stockée</p>
          <p className="mt-1">
            <Pill tone={cfg.api_key_set ? "good" : "muted"}>
              {cfg.api_key_set ? "● Chiffrée en base" : "○ Aucune"}
            </Pill>
          </p>
        </Card>
      </div>

      <Card>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSave) save.mutate();
          }}
        >
          <div className="flex items-center gap-3 sm:col-span-2">
            <Switch
              id="llm-on"
              checked={draft.enabled}
              disabled={!write}
              onCheckedChange={(v) => patch({ enabled: v })}
            />
            <label htmlFor="llm-on" className="text-sm font-medium">
              Activer l'Assistant IA
            </label>
          </div>

          <Field
            label="URL endpoint du modèle"
            htmlFor="llm-url"
            error={draft.enabled && draft.base_url && !u.ok ? (u.message ?? null) : null}
            hint="OpenAI-compatible, ex. https://api.openai.com/v1 — endpoint /chat/completions sera appelé."
          >
            <input
              id="llm-url"
              className={inputCls}
              disabled={!write}
              value={draft.base_url}
              onChange={(e) => patch({ base_url: e.target.value })}
              placeholder="https://…"
            />
          </Field>

          <Field label="Code / identifiant du modèle" htmlFor="llm-model">
            <input
              id="llm-model"
              className={inputCls}
              disabled={!write}
              value={draft.model}
              onChange={(e) => patch({ model: e.target.value })}
              placeholder="gpt-4o-mini"
            />
          </Field>

          {draft.enabled && u.ok && !u.https && (
            <p
              role="alert"
              className="rounded-md bg-warning px-3 py-2 text-xs text-warning-foreground sm:col-span-2"
            >
              ⚠ Endpoint non sécurisé (HTTP) : la clé API serait transmise en clair.
            </p>
          )}

          <Field label="Fournisseur" htmlFor="llm-prov">
            <select
              id="llm-prov"
              className={inputCls}
              disabled={!write}
              value={draft.provider || "custom"}
              onChange={(e) => patch({ provider: e.target.value })}
            >
              {LlmProviderOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Clé API"
            htmlFor="llm-secret"
            hint={
              cfg.api_key_set
                ? "Une clé est enregistrée (chiffrée). Champ vide = clé actuelle préservée. Entrer une nouvelle clé pour la remplacer. Pour l'effacer : bouton « Effacer la clé » ci-dessous."
                : "Aucune clé enregistrée. Entrez-la pour l'enregistrer, chiffrée au repos."
            }
          >
            <div className="flex items-center gap-2">
              <input
                id="llm-secret"
                type="password"
                autoComplete="off"
                className={inputCls}
                disabled={!write}
                value={secret}
                onChange={(e) => touchSecret(e.target.value)}
                placeholder={cfg.api_key_set ? "•••••• (clé enregistrée)" : "sk-…"}
              />
              {cfg.api_key_set && write && (
                <button
                  type="button"
                  className="whitespace-nowrap rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1 text-[11px] font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                  disabled={clearKey.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Effacer la clé API stockée ?\n\nLe LLM deviendra indisponible tant qu'aucune nouvelle clé ne sera posée. Cette action est irréversible — vous devrez re-saisir la clé pour la remettre.",
                      )
                    ) {
                      clearKey.mutate();
                    }
                  }}
                >
                  {clearKey.isPending ? "Effacement…" : "Effacer la clé"}
                </button>
              )}
            </div>
          </Field>

          <Field label="Température" htmlFor="llm-temp" hint="Vide = défaut du modèle.">
            <input
              id="llm-temp"
              type="number"
              step="0.01"
              min={0}
              max={2}
              className={inputCls}
              disabled={!write}
              value={draft.temperature ?? ""}
              onChange={(e) =>
                patch({ temperature: e.target.value === "" ? null : Number(e.target.value) })
              }
              placeholder="—"
            />
          </Field>

          <Field label="Max tokens (sortie)" htmlFor="llm-maxtok" hint="Vide = défaut du modèle.">
            <input
              id="llm-maxtok"
              type="number"
              step="1"
              min={1}
              className={inputCls}
              disabled={!write}
              value={draft.max_tokens ?? ""}
              onChange={(e) =>
                patch({ max_tokens: e.target.value === "" ? null : Number(e.target.value) })
              }
              placeholder="—"
            />
          </Field>

          <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2">
            <SaveStatus save={save} dirty={dirty} />
            {write && (
              <div className="flex gap-2">
                <button
                  type="button"
                  className={btn}
                  disabled={test.isPending || dirty}
                  title={dirty ? "Enregistrez d'abord" : "Ping réel chat completions (1 token)"}
                  onClick={() => test.mutate()}
                >
                  <PlugZap className="h-3.5 w-3.5" />
                  {test.isPending ? "Test en cours…" : "Tester la connexion"}
                </button>
                <button type="button" className={btn} onClick={reset} disabled={!dirty}>
                  Annuler
                </button>
                <button className={btnPrimary} disabled={!canSave || save.isPending}>
                  Enregistrer
                </button>
              </div>
            )}
          </div>

          {/* 1.11.1 — Avertissement destructif retiré : « Enregistrer »
              ne détruit plus jamais la clé stockée (vide = pas de changement).
              L'effacement passe par le bouton dédié « Effacer la clé » qui
              demande une confirmation window.confirm. */}

          {testResult && <TestResultLine r={testResult} />}
        </form>
      </Card>
    </SettingsSection>
  );
}

function SaveStatus({
  save,
  dirty,
}: {
  save: { isPending: boolean; isSuccess: boolean; isError: boolean; error: unknown };
  dirty: boolean;
}) {
  let content: ReactNode;
  if (save.isPending) {
    content = (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Enregistrement…
      </span>
    );
  } else if (save.isError) {
    content = (
      <span className="inline-flex items-center gap-1 text-destructive">
        <AlertTriangle className="h-3 w-3" />
        Échec : {errMsg(save.error)}
      </span>
    );
  } else if (dirty) {
    content = (
      <span className="text-warning-foreground">Modifications non enregistrées (aperçu local)</span>
    );
  } else if (save.isSuccess) {
    content = (
      <span className="inline-flex items-center gap-1 text-sev-good">
        <CheckCircle2 className="h-3 w-3" />
        Enregistré (serveur)
      </span>
    );
  } else {
    content = <span className="text-muted-foreground">Aucune modification</span>;
  }
  return (
    <p role="status" aria-live="polite" className="text-xs">
      {content}
    </p>
  );
}

function TestResultLine({ r }: { r: LlmTestResult }) {
  if (r.ok) {
    return (
      <p
        role="status"
        className="inline-flex items-center gap-1 text-xs text-sev-good sm:col-span-2"
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        Connexion OK ({r.model}, {r.latency_ms} ms).
      </p>
    );
  }
  return (
    <p
      role="alert"
      className="inline-flex items-start gap-1 text-xs text-destructive sm:col-span-2"
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        Connexion KO ({r.latency_ms} ms) — {r.message || "détail indisponible"}.
      </span>
    </p>
  );
}
