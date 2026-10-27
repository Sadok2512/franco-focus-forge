import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { isTransientUpstreamError, upstreamUnavailableResponse } from "./lib/upstream-unavailable";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

const API_PREFIX = "/api";

function apiUpstream(): string {
  return (
    process.env["BC4_API_UPSTREAM"] ??
    process.env["VITE_BC4_API_UPSTREAM"] ??
    "http://api:8000"
  ).replace(/\/+$/, "");
}

async function proxyApiRequest(request: Request): Promise<Response> {
  const source = new URL(request.url);
  const path = source.pathname.slice(API_PREFIX.length) || "/";
  const target = `${apiUpstream()}${path}${source.search}`;
  const headers = new Headers(request.headers);

  // The upstream receives a server-to-server request. Keeping the browser's
  // Host/Origin would make the backend apply CORS to an internal hop.
  headers.delete("host");
  headers.delete("origin");

  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    redirect: "manual",
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    init.duplex = "half";
  }
  return fetch(target, init);
}

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const pathname = new URL(request.url).pathname;
      if (pathname === API_PREFIX || pathname.startsWith(`${API_PREFIX}/`)) {
        try {
          return await proxyApiRequest(request);
        } catch (error) {
          if (isTransientUpstreamError(error)) return upstreamUnavailableResponse();
          throw error;
        }
      }
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
