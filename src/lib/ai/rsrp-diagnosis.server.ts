import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";

export type RsrpDiagnosisInput = {
  lang: "en" | "fr";
  status: Record<string, string | number | null>;
  metadata: Record<string, string>;
  notes: string;
};

const INSTRUCTIONS = `You are a senior radio drive-test engineer (LTE/NR, NMF/QXDM captures, BC4 decoder pipeline).
A technician reports that RSRP points are missing on the map for a capture. Using ONLY the status and metadata provided,
explain the most probable causes (ranked, each with a short justification tied to the given facts) and propose
targeted, concrete checks the technician can run (what to look at, where, expected result).
Never invent measured values, counts or coordinates; if a fact is missing, say it is unknown and suggest how to obtain it.
Format: markdown with two sections "Probable causes" and "Targeted checks" (translate headings to the requested language). Be concise.`;

export async function diagnoseRsrp(input: RsrpDiagnosisInput, signal?: AbortSignal): Promise<string> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured (missing key).");
  let runId: string | undefined;
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: async (url, init) => {
      const headers = new Headers(init?.headers);
      if (runId) headers.set("X-Lovable-AIG-Run-ID", runId);
      const res = await fetch(url, { ...init, headers });
      runId ??= res.headers.get("X-Lovable-AIG-Run-ID") ?? undefined;
      return res;
    },
  });
  let failure: unknown;
  const result = streamText({
    model: provider.responses("openai/gpt-6-astra"),
    instructions: INSTRUCTIONS,
    messages: [
      {
        role: "user",
        content: `Answer language: ${input.lang === "fr" ? "French" : "English"}
Observed status (from the app):
${JSON.stringify(input.status, null, 2)}
Capture metadata (technician-provided):
${JSON.stringify(input.metadata, null, 2)}
Technician notes:
${input.notes || "(none)"}`,
      },
    ],
    abortSignal: signal,
    maxRetries: 0,
    onError: ({ error }) => {
      failure = error;
    },
    providerOptions: {
      openai: {
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        store: false,
        include: ["reasoning.encrypted_content"],
      },
    },
  } as Parameters<typeof streamText>[0]);
  const text = await result.text;
  if (failure) {
    const status = (failure as { statusCode?: number }).statusCode;
    if (status === 402) throw new Error("AI credits exhausted: add credits in Settings → Plans & credits.");
    if (status === 429) throw new Error("AI is rate limited, try again in a moment.");
    if (status === 403) throw new Error("AI access is blocked for this workspace.");
    throw new Error("AI diagnosis failed.");
  }
  if (!text.trim()) throw new Error("The AI returned no answer.");
  return text;
}
