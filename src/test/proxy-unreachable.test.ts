import { afterEach, describe, expect, it, vi } from "vitest";
import { proxyApiRequest } from "@/server";

afterEach(() => vi.unstubAllGlobals());

describe("proxy when BC4 is unreachable", () => {
  it("answers 502 instead of crashing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const res = await proxyApiRequest(new Request("http://front.test/api/auth/login", { method: "POST", body: "{}" }));
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe("upstream_unreachable");
  });
});
