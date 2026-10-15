import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlugZap } from "lucide-react";
import { useState } from "react";
import { getAiConfig, putAiConfig, testAiConnection, urlCheck } from "@/lib/api/client";
import type { AiConfig, AiConfigInput } from "@/lib/api/settings-schemas";
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
  SaveStatus,
  SettingsSection,
  useActor,
  useFormState,
} from "../shared";

export function AiConfigPanel() {
  const actor = useActor();
  const q = useQuery({
    queryKey: ["settings", "ai", actor.role],
    queryFn: () => getAiConfig(actor),
    enabled: can(actor.role, "ai.read"),
    retry: false,
  });
  if (!can(actor.role, "ai.read")) return <Forbidden />;
  if (q.isLoading) return <LoadingSkeleton className="h-64" />;
  if (q.isError) return <ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} />;
  return <AiForm cfg={q.data!} />;
}

function AiForm({ cfg }: { cfg: AiConfig }) {
  const actor = useActor();
  const qc = useQueryClient();
  const write = can(actor.role, "ai.write");
  const persisted: AiConfigInput = {
    enabled: cfg.enabled,
    endpoint_url: cfg.endpoint_url,
    model_code: cfg.model_code,
    provider: cfg.provider,
    auth_method: cfg.auth_method,
  };
  const form = useFormState(persisted);
  const [secret, setSecret] = useState(""); // in-memory only, cleared after save
  const test = useMutation({
    mutationFn: () => testAiConnection(actor),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", "ai"] }),
  });
  const d = form.draft!;
  const url = urlCheck(d.endpoint_url);
  const save = () =>
    form.save(async (v) => {
      await putAiConfig(actor, secret ? { ...v, secret } : v);
      setSecret("");
      await qc.invalidateQueries({ queryKey: ["settings"] });
    });
  const conn = cfg.connection;

  return (
    <SettingsSection
      title="Configuration IA"
      description="Paramètres du modèle de l'Assistant. Phase mock : aucune requête n'est envoyée vers l'URL saisie."
    >
      {!write && <ReadOnlyNotice />}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <p className="text-[11px] text-muted-foreground">Configuration enregistrée</p>
          <p className="mt-1 text-sm font-semibold">v{cfg.config_version}</p>
          <p className="text-[11px] text-muted-foreground">{fmtDate(cfg.saved_at)}</p>
        </Card>
        <Card>
          <p className="text-[11px] text-muted-foreground">Assistant activé</p>
          <p className="mt-1">
            <Pill tone={cfg.enabled ? "good" : "muted"}>{cfg.enabled ? "● Oui" : "○ Non"}</Pill>
          </p>
        </Card>
        <Card>
          <p className="text-[11px] text-muted-foreground">Modèle réellement joignable</p>
          <p className="mt-1">
            <Pill tone="muted">Inconnu — non vérifiable en mock</Pill>
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Dernier test simulé :{" "}
            {conn.status === "untested" ? "jamais" : conn.status === "mock_ok" ? "réussi" : "échec"}
          </p>
        </Card>
      </div>
      <Card>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="flex items-center gap-3 sm:col-span-2">
            <Switch
              id="ai-on"
              checked={d.enabled}
              disabled={!write}
              onCheckedChange={(v) => form.setDraft({ enabled: v })}
            />
            <label htmlFor="ai-on" className="text-sm font-medium">
              Activer l'Assistant IA
            </label>
          </div>
          <Field
            label="URL endpoint du modèle"
            htmlFor="ai-url"
            error={
              form.error?.field === "endpoint_url"
                ? form.error.message
                : d.endpoint_url && !url.ok
                  ? url.message
                  : null
            }
            hint="HTTPS recommandé."
          >
            <input
              id="ai-url"
              className={inputCls}
              disabled={!write}
              value={d.endpoint_url}
              onChange={(e) => form.setDraft({ endpoint_url: e.target.value })}
              placeholder="https://…"
            />
          </Field>
          <Field
            label="Code / identifiant du modèle"
            htmlFor="ai-model"
            error={form.error?.field === "model_code" ? form.error.message : null}
          >
            <input
              id="ai-model"
              className={inputCls}
              disabled={!write}
              value={d.model_code}
              onChange={(e) => form.setDraft({ model_code: e.target.value })}
            />
          </Field>
          {url.ok && !url.https && (
            <p
              role="alert"
              className="rounded-md bg-warning px-3 py-2 text-xs text-warning-foreground sm:col-span-2"
            >
              ⚠ Endpoint non sécurisé (HTTP) : les échanges ne seraient pas chiffrés.
            </p>
          )}
          <Field label="Fournisseur" htmlFor="ai-prov">
            <select
              id="ai-prov"
              className={inputCls}
              disabled={!write}
              value={d.provider}
              onChange={(e) => form.setDraft({ provider: e.target.value })}
            >
              {cfg.providers.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </Field>
          <Field label="Méthode d'authentification" htmlFor="ai-auth">
            <select
              id="ai-auth"
              className={inputCls}
              disabled={!write}
              value={d.auth_method}
              onChange={(e) =>
                form.setDraft({ auth_method: e.target.value as AiConfigInput["auth_method"] })
              }
            >
              <option value="none">Aucune</option>
              <option value="api_key">Clé API</option>
              <option value="bearer">Jeton Bearer</option>
            </select>
          </Field>
          {d.auth_method !== "none" && (
            <div className="sm:col-span-2">
              <Field
                label="Secret (clé / jeton)"
                htmlFor="ai-secret"
                hint={`Champ fictif non persistant : jamais stocké localement ni renvoyé. ${cfg.has_secret ? "Un secret a été déclaré." : "Aucun secret déclaré."}`}
              >
                <input
                  id="ai-secret"
                  type="password"
                  autoComplete="off"
                  className={inputCls}
                  disabled={!write}
                  value={secret}
                  onChange={(e) => {
                    setSecret(e.target.value);
                    form.setDraft({});
                  }}
                  placeholder="••••••••"
                />
              </Field>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2">
            <SaveStatus status={form.status} error={form.error} />
            {write && (
              <div className="flex gap-2">
                <button
                  type="button"
                  className={btn}
                  disabled={test.isPending || form.status === "dirty"}
                  title={form.status === "dirty" ? "Enregistrez d'abord" : undefined}
                  onClick={() => test.mutate()}
                >
                  <PlugZap className="h-3.5 w-3.5" />
                  Tester la connexion (simulé)
                </button>
                <button
                  type="button"
                  className={btn}
                  onClick={() => {
                    form.reset();
                    setSecret("");
                  }}
                >
                  Annuler
                </button>
                <button
                  className={btnPrimary}
                  disabled={form.status === "saving" || form.status === "pristine"}
                >
                  Enregistrer
                </button>
              </div>
            )}
          </div>
          {conn.message && (
            <p
              role="status"
              className={`text-xs sm:col-span-2 ${conn.status === "mock_ok" ? "text-sev-good" : "text-destructive"}`}
            >
              {conn.message} ({fmtDate(conn.tested_at)})
            </p>
          )}
        </form>
      </Card>
    </SettingsSection>
  );
}
