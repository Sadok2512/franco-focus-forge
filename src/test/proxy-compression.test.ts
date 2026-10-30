import { afterEach, describe, expect, it, vi } from "vitest";

import { acceptsGzip, isCellReferenceUpload, proxyApiRequest } from "@/server";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("production API proxy compression", () => {
  it.each([
    ["gzip", true],
    ["br, gzip", true],
    ["gzip;q=0", false],
    ["br, *;q=0.5", true],
    ["br", false],
    [null, false],
  ])("negotiates %s as gzip=%s", (header, expected) => {
    expect(acceptsGzip(header)).toBe(expected);
  });

  it("requests identity upstream and emits one coherent gzip layer", async () => {
    const payload = {
      rows: Array.from({ length: 100 }, (_, index) => ({ index, value: "radio" })),
    };
    const body = JSON.stringify(payload);
    const fetchMock = vi.fn(async (_target: string, init: RequestInit) => {
      expect(new Headers(init.headers).get("accept-encoding")).toBe("identity");
      // Reproduce the broken runtime shape: decoded bytes with stale encoded headers.
      return new Response(body, {
        headers: {
          "content-type": "application/json",
          "content-encoding": "gzip",
          "content-length": "17",
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await proxyApiRequest(
      new Request("http://front.test/api/projects/p/metrics", {
        headers: { "accept-encoding": "br, gzip" },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-encoding")).toBe("gzip");
    expect(response.headers.get("content-length")).toBeNull();
    expect(response.headers.get("vary")).toContain("Accept-Encoding");
    const decoded = await new Response(
      response.body!.pipeThrough(new DecompressionStream("gzip")),
    ).json();
    expect(decoded).toEqual(payload);
  });

  it("returns clear JSON when the client does not accept gzip", async () => {
    const payload = { status: "ok" };
    const body = JSON.stringify(payload);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(body, {
            headers: {
              "content-type": "application/json",
              "content-length": String(new TextEncoder().encode(body).byteLength),
            },
          }),
      ),
    );

    const response = await proxyApiRequest(
      new Request("http://front.test/api/projects/p", {
        headers: { "accept-encoding": "identity" },
      }),
    );

    expect(response.headers.get("content-encoding")).toBeNull();
    await expect(response.json()).resolves.toEqual(payload);
  });

  it.each(["/api/reference/cell/upload", "/api/settings/cell-ref/upload"])(
    "streams %s with a route-only one-hour idle timeout",
    async (pathname) => {
      let forwardedBody: BodyInit | null | undefined;
      let timeout: unknown;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_target: string, init: RequestInit & { timeout?: number }) => {
          forwardedBody = init.body;
          timeout = init.timeout;
          return Response.json({ status: "completed" });
        }),
      );
      const source = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("multipart bytes"));
          controller.close();
        },
      });
      const request = new Request(`http://front.test${pathname}`, {
        method: "POST",
        body: source,
        duplex: "half",
      } as RequestInit & { duplex: "half" });

      await proxyApiRequest(request);

      expect(isCellReferenceUpload(pathname, "POST")).toBe(true);
      expect(forwardedBody).toBe(request.body);
      expect(timeout).toBe(60 * 60 * 1000);
    },
  );

  it("does not extend ordinary API calls", async () => {
    let timeout: unknown = "unset";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_target: string, init: RequestInit & { timeout?: number }) => {
        timeout = init.timeout;
        return Response.json({ status: "ok" });
      }),
    );

    await proxyApiRequest(new Request("http://front.test/api/projects"));

    expect(timeout).toBeUndefined();
  });
});
