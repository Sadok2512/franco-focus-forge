import { z } from "zod";
import type { AnalysisScope } from "@/lib/analysis-scope";
import { analysisScopeQueryKey } from "@/lib/analysis-scope";
import { apiFetch } from "./http";

const AnalysisScopeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("capture"), captureId: z.string() }),
  z.object({ type: z.literal("superstream"), superstreamId: z.string() }),
]);

const ResolvedAnalysisMemberSchema = z.object({
  projectId: z.string(),
  captureId: z.string(),
  memberPosition: z.number().int().nonnegative(),
});

export const ResolvedAnalysisScopeSchema = z.object({
  projectId: z.string(),
  scope: AnalysisScopeSchema,
  scopeRevision: z.number().int().positive().nullable(),
  members: z.array(ResolvedAnalysisMemberSchema),
  identityFields: z.tuple([z.literal("project_id"), z.literal("capture_id"), z.literal("seq")]),
  orderFields: z.tuple([z.literal("member_position"), z.literal("seq")]),
});
export type ResolvedAnalysisScope = z.infer<typeof ResolvedAnalysisScopeSchema>;

function requestBody(scope: AnalysisScope) {
  return scope.type === "capture"
    ? { type: scope.type, captureId: scope.captureId }
    : { type: scope.type, superstreamId: scope.superstreamId };
}

export function resolveAnalysisScope(
  projectId: string,
  scope: AnalysisScope,
  signal?: AbortSignal,
): Promise<ResolvedAnalysisScope> {
  return apiFetch(
    `/projects/${encodeURIComponent(projectId)}/analysis-scopes/resolve`,
    ResolvedAnalysisScopeSchema,
    {
      method: "POST",
      body: JSON.stringify(requestBody(scope)),
      signal,
    },
  );
}

export function resolvedAnalysisScopeQuery(projectId: string, scope: AnalysisScope) {
  return {
    queryKey: analysisScopeQueryKey(projectId, scope),
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      resolveAnalysisScope(projectId, scope, signal),
  };
}
