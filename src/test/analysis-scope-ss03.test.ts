import { afterEach, describe, expect, it, vi } from "vitest";
import {
  analysisModuleQueryKey,
  analysisScopeQueryKey,
  analysisScopeSearch,
  validateAnalysisScopeSearch,
  type AnalysisScope,
} from "@/lib/analysis-scope";
import { resolveAnalysisScope } from "@/lib/api/analysis-scopes";

const capture: AnalysisScope = { type: "capture", captureId: "cap-a" };
const stream: AnalysisScope = {
  type: "superstream",
  superstreamId: "ss-a",
  revision: 7,
};

afterEach(() => vi.unstubAllGlobals());

describe("SS-03 AnalysisScope frontend contract", () => {
  it("isolates query keys by project, scope type, id and revision", () => {
    expect(analysisScopeQueryKey("project-a", capture)).not.toEqual(
      analysisScopeQueryKey("project-b", capture),
    );
    expect(analysisScopeQueryKey("project-a", stream)).not.toEqual(
      analysisScopeQueryKey("project-a", { ...stream, revision: 8 }),
    );
    expect(analysisModuleQueryKey("project-a", "map", stream)).not.toEqual(
      analysisModuleQueryKey("project-a", "signaling", stream),
    );
  });

  it("keeps capture search compatibility and validates Superstream navigation", () => {
    expect(analysisScopeSearch(capture)).toMatchObject({
      analysis_scope: "capture",
      capture_id: "cap-a",
    });
    expect(
      validateAnalysisScopeSearch({
        analysis_scope: "superstream",
        superstream_id: "ss-a",
        scope_revision: "7",
      }),
    ).toEqual(analysisScopeSearch(stream));
    expect(validateAnalysisScopeSearch({ analysis_scope: "superstream" })).toEqual({
      analysis_scope: undefined,
      capture_id: undefined,
      superstream_id: undefined,
      scope_revision: undefined,
    });
  });

  it("sends only the backend scope contract and preserves resolved identity", async () => {
    const response = {
      projectId: "project-a",
      scope: { type: "superstream", superstreamId: "ss-a" },
      scopeRevision: 7,
      members: [
        { projectId: "project-a", captureId: "cap-b", memberPosition: 0 },
        { projectId: "project-a", captureId: "cap-a", memberPosition: 1 },
      ],
      identityFields: ["project_id", "capture_id", "seq"],
      orderFields: ["member_position", "seq"],
    };
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify(response), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const resolved = await resolveAnalysisScope("project-a", stream);
    const [, init] = fetchMock.mock.calls[0] as unknown as [unknown, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      type: "superstream",
      superstreamId: "ss-a",
    });
    expect(resolved.members.map((member) => member.captureId)).toEqual(["cap-b", "cap-a"]);
    expect(resolved.identityFields).toEqual(["project_id", "capture_id", "seq"]);
  });
});
