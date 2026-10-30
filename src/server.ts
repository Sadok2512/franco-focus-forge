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

export function acceptsGzip(value: string | null): boolean {
  if (!value) return false;
  let gzipQuality: number | undefined;
  let wildcardQuality: number | undefined;
  for (const item of value.split(",")) {
    const [rawEncoding, ...parameters] = item.trim().split(";");
    const encoding = rawEncoding?.trim().toLowerCase();
    if (encoding !== "gzip" && encoding !== "*") continue;
    let quality = 1;
    for (const parameter of parameters) {
      const match = /^\s*q\s*=\s*([0-9.]+)\s*$/i.exec(parameter);
      if (match) {
        const parsed = Number(match[1]);
        quality = Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 0;
      }
    }
    if (encoding === "gzip") gzipQuality = quality;
    else wildcardQuality = quality;
  }
  return (gzipQuality ?? wildcardQuality ?? 0) > 0;
}

function appendVaryAcceptEncoding(headers: Headers): void {
  const values = (headers.get("vary") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!values.some((value) => value.toLowerCase() === "accept-encoding")) {
    values.push("Accept-Encoding");
  }
  headers.set("vary", values.join(", "));
}

function hasResponseBody(request: Request, response: Response): boolean {
  return (
    request.method !== "HEAD" &&
    response.body !== null &&
    response.status !== 204 &&
    response.status !== 205 &&
    response.status !== 304
  );
}

function proxyResponse(request: Request, upstream: Response): Response {
  const headers = new Headers(upstream.headers);
  const staleUpstreamEncoding = headers.has("content-encoding");
  headers.delete("content-encoding");
  headers.delete("transfer-encoding");
  appendVaryAcceptEncoding(headers);

  const compress =
    hasResponseBody(request, upstream) && acceptsGzip(request.headers.get("accept-encoding"));
  if (compress) {
    headers.delete("content-length");
    headers.set("content-encoding", "gzip");
    return new Response(upstream.body!.pipeThrough(new CompressionStream("gzip")), {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  }

  // `fetch` implementations may transparently decode an encoded upstream
  // response while retaining its wire length. Never forward that stale pair.
  if (staleUpstreamEncoding) headers.delete("content-length");
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

export async function proxyApiRequest(request: Request): Promise<Response> {
  const source = new URL(request.url);
  const path = source.pathname.slice(API_PREFIX.length) || "/";
  const target = `${apiUpstream()}${path}${source.search}`;
  const headers = new Headers(request.headers);

  // The upstream receives a server-to-server request. Keeping the browser's
  // Host/Origin would make the backend apply CORS to an internal hop.
  headers.delete("host");
  headers.delete("origin");
  // One compression layer only. The internal hop is always identity; this
  // proxy negotiates and emits the browser-facing representation itself.
  headers.set("accept-encoding", "identity");

  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    redirect: "manual",
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    init.duplex = "half";
  }
  const upstream = await fetch(target, init);
  return proxyResponse(request, upstream);
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
