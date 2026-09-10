import "./lib/error-capture";

import * as Sentry from "@sentry/cloudflare";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

type WorkerEnv = { SENTRY_DSN?: string };

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
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  const recoveredError = consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`);
  console.error(recoveredError);
  Sentry.captureException(recoveredError);
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

// Cloudflare Workers reuse the same isolate across requests, so a bare module-level
// `Sentry.init()` would leak scope/breadcrumbs between unrelated requests. `withSentry`
// initializes and binds the SDK per-request via AsyncLocalStorage instead — see
// @sentry/cloudflare's withSentry/instrumentFetch implementation.
export default Sentry.withSentry(
  (env: WorkerEnv) => ({
    dsn:
      env.SENTRY_DSN ??
      "https://655cfee3b27b38e98bed27e8e2cf660d@o4512061608558592.ingest.de.sentry.io/4512061624942672",
    dataCollection: {
      httpBodies: [], // minimum veri toplama kararı — istek gövdelerini raporlama
    },
  }),
  {
    async fetch(request: Request, env: WorkerEnv, ctx: unknown) {
      try {
        const handler = await getServerEntry();
        const response = await handler.fetch(request, env, ctx);
        return await normalizeCatastrophicSsrResponse(response);
      } catch (error) {
        console.error(error);
        Sentry.captureException(error);
        return new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
    },
  },
);
