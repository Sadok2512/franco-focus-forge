import { describe, expect, it } from "vitest";
import {
  isTransientUpstreamError,
  upstreamErrorCode,
  upstreamUnavailableResponse,
} from "@/lib/upstream-unavailable";
import { ApiHttpError, isUpstreamUnavailable } from "@/lib/api/http";

describe("upstream unavailability", () => {
  it.each(["EAI_AGAIN", "ECONNREFUSED", "ECONNRESET"])(
    "maps %s to a retryable 503 response",
    async (code) => {
      const error = new Error("proxy failed", { cause: Object.assign(new Error(code), { code }) });
      expect(upstreamErrorCode(error)).toBe(code);
      expect(isTransientUpstreamError(error)).toBe(true);
      const response = upstreamUnavailableResponse();
      expect(response.status).toBe(503);
      expect(response.headers.get("Retry-After")).toBe("3");
      await expect(response.json()).resolves.toEqual({
        detail: { code: "UPSTREAM_UNAVAILABLE", message: "Reconnexion au backend…" },
      });
    },
  );

  it("does not mask non-transient proxy failures", () => {
    expect(isTransientUpstreamError(Object.assign(new Error("bad"), { code: "EPROTO" }))).toBe(
      false,
    );
  });

  it("marks the typed 503 as retryable by project queries", () => {
    expect(isUpstreamUnavailable(new ApiHttpError("UPSTREAM_UNAVAILABLE", "retry", 503))).toBe(
      true,
    );
    expect(isUpstreamUnavailable(new ApiHttpError("HTTP_ERROR", "bad", 500))).toBe(false);
  });
});
