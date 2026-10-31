const TRANSIENT_UPSTREAM_CODES = new Set(["EAI_AGAIN", "ECONNREFUSED", "ECONNRESET"]);
const UPSTREAM_TIMEOUT_CODES = new Set([
  "ETIMEDOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
]);

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

export function isUpstreamTimeoutError(error: unknown): boolean {
  const code = upstreamErrorCode(error);
  return code !== null && UPSTREAM_TIMEOUT_CODES.has(code);
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

export function cellReferenceUploadTimeoutResponse(): Response {
  return Response.json(
    {
      detail: {
        code: "CELL_REFERENCE_UPLOAD_TIMEOUT",
        message:
          "Le proxy a interrompu l'import du référentiel avant la réponse de l'API. " +
          "Aucune confirmation d'import n'a été reçue ; réessayez ou contactez l'administrateur.",
      },
    },
    { status: 504 },
  );
}
