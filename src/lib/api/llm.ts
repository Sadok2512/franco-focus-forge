// Client API /settings/llm — appel RÉEL au back bc4-back (0.17.0+).
// Pas de mock : si la UI est en mode mock (VITE_BC4_DATA ≠ "api"), les
// quatre fonctions renvoient quand même un stub cohérent (ex. config
// vide, test « backend injoignable ») pour que la UI reste navigable
// en démo. En mode "api", on parle directement au back et la clé n'est
// jamais stockée côté client — elle est passée en PUT, puis effacée.

import { apiBase, apiFetch, isApiMode } from "./http";
import {
  LlmSettingsSchema,
  LlmTestResultSchema,
  type LlmSettings,
  type LlmSettingsInput,
  type LlmTestResult,
} from "./llm-schemas";

const EMPTY_CFG: LlmSettings = {
  provider: "",
  base_url: "",
  model: "",
  enabled: false,
  api_key_set: false,
  temperature: null,
  max_tokens: null,
  updated_at: null,
};

/** GET /settings/llm — admin requis côté back (403 si non-admin). */
export async function getLlmSettings(): Promise<LlmSettings> {
  if (!isApiMode()) return EMPTY_CFG;
  return apiFetch("/settings/llm", LlmSettingsSchema);
}

/** PUT /settings/llm — admin requis.
 *  `api_key === ""` ⇒ efface la clé stockée. `undefined` ⇒ ne touche pas. */
export async function putLlmSettings(input: LlmSettingsInput): Promise<LlmSettings> {
  if (!isApiMode()) return EMPTY_CFG;
  return apiFetch("/settings/llm", LlmSettingsSchema, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

/** POST /settings/llm/test — probe chat completions `max_tokens=1`.
 *  Admin requis. Toujours 200 — succès dans `ok`, détail de l'échec dans
 *  `message`. Jamais la clé en clair dans la réponse. */
export async function testLlmConnection(): Promise<LlmTestResult> {
  if (!isApiMode()) {
    return {
      ok: false,
      model: "",
      latency_ms: 0,
      message: "Mode mock — aucun provider n'est contacté.",
    };
  }
  return apiFetch("/settings/llm/test", LlmTestResultSchema, {
    method: "POST",
  });
}

/** Base URL pratique pour les messages d'aide affichés par la UI. */
export function llmApiBase(): string {
  return apiBase();
}
