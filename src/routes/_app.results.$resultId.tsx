import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getAnalyticsResult } from "@/lib/api/client";
import { getSession, toUserMessage } from "@/lib/api/http";
export const Route = createFileRoute("/_app/results/$resultId")({ component: ResultPage });
function ResultPage() {
  const { resultId } = Route.useParams();
  const admin = getSession()?.user.role === "admin";
  const query = useQuery({
    queryKey: ["analytics-result", resultId],
    queryFn: ({ signal }) => getAnalyticsResult(resultId, signal),
    enabled: admin,
  });
  return (
    <main className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Résultat {resultId}</h1>
      {!admin ? (
        <p>Accès administrateur requis.</p>
      ) : query.isError ? (
        <p role="alert">{toUserMessage(query.error)}</p>
      ) : query.isPending ? (
        <p>Chargement…</p>
      ) : (
        <pre className="whitespace-pre-wrap break-all rounded border p-4 text-xs">
          {JSON.stringify(query.data, null, 2)}
        </pre>
      )}
    </main>
  );
}
