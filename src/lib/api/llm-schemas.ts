import { z } from "zod";

// -------------------------------------------------------------------
// Schémas Zod pour les settings LLM côté back (bc4-back 0.16.0+).
//
// Règle d'or : la clé en clair n'arrive JAMAIS dans la réponse. Le back
// expose seulement `api_key_set: bool`. Côté UI, la clé est tenue en
// mémoire React (`useState`) le temps d'un PUT, puis effacée — jamais
// stockée dans localStorage ni passée à react-query comme valeur.
// -------------------------------------------------------------------

export const LlmProviderOptions = [
  "openai",
  "mistral",
  "together",
  "groq",
  "openrouter",
  "custom",
] as const;
export type LlmProvider = (typeof LlmProviderOptions)[number];

export const LlmSettingsSchema = z.object({
  provider: z.string(),
  base_url: z.string(),
  model: z.string(),
  enabled: z.boolean(),
  api_key_set: z.boolean(),
  temperature: z.number().nullable(),
  max_tokens: z.number().int().nullable(),
  updated_at: z.string().nullable(),
});
export type LlmSettings = z.infer<typeof LlmSettingsSchema>;

export const LlmSettingsInputSchema = z.object({
  provider: z.string().optional(),
  base_url: z.string().optional(),
  model: z.string().optional(),
  // `""` = effacer la clé stockée. `undefined` = ne pas toucher.
  api_key: z.string().optional(),
  enabled: z.boolean().optional(),
  temperature: z.number().nullable().optional(),
  max_tokens: z.number().int().nullable().optional(),
});
export type LlmSettingsInput = z.infer<typeof LlmSettingsInputSchema>;

export const LlmTestResultSchema = z.object({
  ok: z.boolean(),
  model: z.string(),
  latency_ms: z.number().int().nonnegative(),
  message: z.string().nullable(),
});
export type LlmTestResult = z.infer<typeof LlmTestResultSchema>;
