import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSuperstream,
  deleteSuperstream,
  renameSuperstream,
  replaceSuperstreamMembers,
  superstreamPreconditionStatus,
} from "@/lib/api/superstreams";

const stream = {
  id: "ss_1",
  projectId: "project-a",
  name: "Morning",
  logIds: ["a.nmf", "b.nmf"],
  captureIds: ["cap-a", "cap-b"],
  positions: [0, 1],
  members: [
    { position: 0, captureId: "cap-a", captureName: "a.nmf" },
    { position: 1, captureId: "cap-b", captureName: "b.nmf" },
  ],
  revision: 3,
  createdAt: "2026-10-31T00:00:00Z",
  updatedAt: "2026-10-31T00:00:00Z",
};

function ok(body: unknown = stream, status = 200) {
  const init: ResponseInit = { status };
  if (body !== null) init.headers = { "Content-Type": "application/json" };
  return Promise.resolve(new Response(body === null ? null : JSON.stringify(body), init));
}

afterEach(() => vi.unstubAllGlobals());

describe("SS-02 API contract", () => {
  it("creates with ordered captureIds and never writes logIds", async () => {
    const fetchMock = vi.fn(() => ok(stream, 201));
    vi.stubGlobal("fetch", fetchMock);
    await createSuperstream("project-a", { name: " Morning ", captureIds: ["cap-b", "cap-a"] });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [unknown, RequestInit];
    expect(String(url)).toContain("/projects/project-a/superstreams");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      name: "Morning",
      captureIds: ["cap-b", "cap-a"],
    });
  });

  it("separates rename, members and delete with If-Match", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => ok({ ...stream, name: "Renamed", revision: 4 }))
      .mockImplementationOnce(() => ok({ ...stream, captureIds: ["cap-b", "cap-a"], revision: 4 }))
      .mockImplementationOnce(() => ok(null, 204));
    vi.stubGlobal("fetch", fetchMock);

    await renameSuperstream("project-a", "ss_1", 3, "Renamed");
    await replaceSuperstreamMembers("project-a", "ss_1", 3, ["cap-b", "cap-a"]);
    await deleteSuperstream("project-a", "ss_1", 3);

    const calls = fetchMock.mock.calls.map(([url, init]) => ({
      url: String(url),
      method: (init as RequestInit).method,
      ifMatch: new Headers((init as RequestInit).headers).get("If-Match"),
    }));
    expect(calls).toEqual([
      {
        url: expect.stringContaining("/projects/project-a/superstreams/ss_1"),
        method: "PATCH",
        ifMatch: '"3"',
      },
      {
        url: expect.stringContaining("/projects/project-a/superstreams/ss_1/members"),
        method: "PUT",
        ifMatch: '"3"',
      },
      {
        url: expect.stringContaining("/projects/project-a/superstreams/ss_1"),
        method: "DELETE",
        ifMatch: '"3"',
      },
    ]);
  });

  it("keeps the project in every URL and classifies 409/428", async () => {
    const error = (status: number, code: string) =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            detail: { code, message: "conflict" },
          }),
          { status, headers: { "Content-Type": "application/json" } },
        ),
      );
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => error(409, "REVISION_CONFLICT"))
      .mockImplementationOnce(() => error(428, "PRECONDITION_REQUIRED"));
    vi.stubGlobal("fetch", fetchMock);
    const conflict = await renameSuperstream("project%2Fother", "ss_1", 1, "x").catch(
      (value) => value,
    );
    const required = await deleteSuperstream("project-b", "ss_1", 1).catch((value) => value);
    expect(superstreamPreconditionStatus(conflict)).toBe(409);
    expect(superstreamPreconditionStatus(required)).toBe(428);
    expect(String(fetchMock.mock.calls[0]![0])).toContain("/projects/project%252Fother/");
    expect(String(fetchMock.mock.calls[1]![0])).toContain("/projects/project-b/");
  });
});
