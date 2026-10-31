import { describe, expect, it } from "vitest";
import {
  cellReferenceUploadTimeoutResponse,
  isTransientUpstreamError,
  isUpstreamTimeoutError,
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

  it.each(["ETIMEDOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT"])(
    "maps upload timeout %s to an explicit 504",
    async (code) => {
      const error = new Error("proxy timeout", {
        cause: Object.assign(new Error(code), { code }),
      });
      expect(isUpstreamTimeoutError(error)).toBe(true);
      const response = cellReferenceUploadTimeoutResponse();
      expect(response.status).toBe(504);
      await expect(response.json()).resolves.toMatchObject({
        detail: { code: "CELL_REFERENCE_UPLOAD_TIMEOUT" },
      });
    },
  );

  it("marks the typed 503 as retryable by project queries", () => {
    expect(isUpstreamUnavailable(new ApiHttpError("UPSTREAM_UNAVAILABLE", "retry", 503))).toBe(
      true,
    );
    expect(isUpstreamUnavailable(new ApiHttpError("HTTP_ERROR", "bad", 500))).toBe(false);
  });
});
