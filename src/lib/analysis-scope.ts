export type CaptureAnalysisScope = {
  type: "capture";
  captureId: string;
};

export type SuperstreamAnalysisScope = {
  type: "superstream";
  superstreamId: string;
  revision: number;
};

export type AnalysisScope = CaptureAnalysisScope | SuperstreamAnalysisScope;
export type AnalysisModule = "signaling" | "metrics" | "map";

export function analysisScopeIdentity(scope: AnalysisScope): readonly unknown[] {
  return scope.type === "capture"
    ? ["capture", scope.captureId]
    : ["superstream", scope.superstreamId, scope.revision];
}

export function analysisScopeQueryKey(projectId: string, scope: AnalysisScope) {
  return ["analysis", projectId, "scope", ...analysisScopeIdentity(scope)] as const;
}

export function analysisModuleQueryKey(
  projectId: string,
  module: AnalysisModule,
  scope: AnalysisScope,
  detail?: readonly unknown[],
) {
  return [
    "analysis",
    projectId,
    module,
    ...analysisScopeIdentity(scope),
    ...(detail ?? []),
  ] as const;
}

export function analysisScopeSearch(scope: AnalysisScope) {
  return scope.type === "capture"
    ? {
        analysis_scope: "capture" as const,
        capture_id: scope.captureId,
        superstream_id: undefined,
        scope_revision: undefined,
      }
    : {
        analysis_scope: "superstream" as const,
        capture_id: undefined,
        superstream_id: scope.superstreamId,
        scope_revision: scope.revision,
      };
}

export function validateAnalysisScopeSearch(search: Record<string, unknown>) {
  const type = search["analysis_scope"];
  const captureId = search["capture_id"];
  const superstreamId = search["superstream_id"];
  const revision = Number(search["scope_revision"]);
  if (type === "capture" && typeof captureId === "string" && captureId.length > 0) {
    return analysisScopeSearch({ type: "capture", captureId });
  }
  if (
    type === "superstream" &&
    typeof superstreamId === "string" &&
    superstreamId.length > 0 &&
    Number.isInteger(revision) &&
    revision >= 1
  ) {
    return analysisScopeSearch({
      type: "superstream",
      superstreamId,
      revision,
    });
  }
  return {
    analysis_scope: undefined,
    capture_id: undefined,
    superstream_id: undefined,
    scope_revision: undefined,
  };
}
