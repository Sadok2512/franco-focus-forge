import { createFileRoute } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SignalingPage } from "@/features/signaling/SignalingPage";
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
export const Route = createFileRoute("/msg-table-check")({
  ssr: false,
  component: () => (
    <QueryClientProvider client={client}>
      <SignalingPage projectId="fx" stateTracksV2 />
    </QueryClientProvider>
  ),
});
