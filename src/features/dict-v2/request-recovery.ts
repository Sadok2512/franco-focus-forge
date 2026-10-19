import { ApiHttpError, ApiNetworkError, toUserMessage } from "@/lib/api/http";

/** Retry only transient upstream failures. Validation, auth and schema failures stay explicit. */
export function isTransientRrcError(error: unknown): boolean {
  return (
    error instanceof ApiNetworkError ||
    (error instanceof ApiHttpError && [502, 503, 504].includes(error.status))
  );
}
export function retryRrcRequest(failureCount: number, error: unknown): boolean {
  return failureCount < 5 && isTransientRrcError(error);
}
export const rrcRetryDelay = (attempt: number) => Math.min(2000 * 2 ** attempt, 10000);
export function rrcRequestMessage(error: unknown): string {
  return isTransientRrcError(error)
    ? "Connexion au serveur temporairement indisponible. Vos sélections sont conservées ; réessayez."
    : toUserMessage(error);
}
