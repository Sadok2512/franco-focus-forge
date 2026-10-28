const TRANSIENT_UPSTREAM_CODES = new Set(["EAI_AGAIN", "ECONNREFUSED", "ECONNRESET"]);

export function upstreamErrorCode(error: unknown): string | null {
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const candidate = current as { code?: unknown; cause?: unknown };
    if (typeof candidate.code === "string") return candidate.code;
    current = candidate.cause;
  }
  return null;
}

export function isTransientUpstreamError(error: unknown): boolean {
  const code = upstreamErrorCode(error);
  return code !== null && TRANSIENT_UPSTREAM_CODES.has(code);
}

export function upstreamUnavailableResponse(): Response {
  return Response.json(
    {
      detail: {
        code: "UPSTREAM_UNAVAILABLE",
        message: "Reconnexion au backend…",
      },
    },
    { status: 503, headers: { "Retry-After": "3" } },
  );
}
