import { describe, expect, it } from "vitest";
import { ApiHttpError, ApiNetworkError, ApiSchemaError } from "@/lib/api/http";
import { retryRrcRequest, rrcRetryDelay } from "@/features/dict-v2/request-recovery";

describe("RRC upstream recovery", () => {
  it("bounds retries to five for network and gateway failures", () => {
    for (const error of [
      new ApiNetworkError("offline"),
      ...[502, 503, 504].map((status) => new ApiHttpError("HTTP_ERROR", "Gateway", status)),
    ]) {
      expect(retryRrcRequest(0, error)).toBe(true);
      expect(retryRrcRequest(4, error)).toBe(true);
      expect(retryRrcRequest(5, error)).toBe(false);
    }
    expect([0, 1, 2, 3, 4].map(rrcRetryDelay)).toEqual([2000, 4000, 8000, 10000, 10000]);
  });
  it("never retries validation, authentication, server bugs, schema or cancellation failures", () => {
    for (const error of [400, 401, 403, 404, 422, 500, 501].map(
      (status) => new ApiHttpError("ERROR", "failure", status),
    ))
      expect(retryRrcRequest(0, error)).toBe(false);
    expect(retryRrcRequest(0, new ApiSchemaError("invalid response"))).toBe(false);
    expect(retryRrcRequest(0, new DOMException("Aborted", "AbortError"))).toBe(false);
  });
});
