import { createFileRoute } from "@tanstack/react-router";

// T1 Faz 2 — iOS Universal Links. Served extension-less at
// /.well-known/apple-app-site-association (Apple's `swcd` fetches exactly
// this path, no `.json`), as raw JSON with no redirect — mirrors the
// sibling `oauth-protected-resource.ts` file-route shape in this same
// `[.well-known]` directory, applied by hand since this has nothing to do
// with MCP.
//
// `paths` lists `/tarifler/*` — the real web path recipes render at
// (tarifler.$slug.tsx) — now that hasat-mobile's `app/+native-intent.tsx`
// (T1 Faz 2b) redirects that incoming path to its `recipe/[slug]` screen.
// `/recipe/*` stays listed too: it's hasat-mobile's native route path, not
// currently linked to from anywhere on the web, but there's no cost to
// claiming it in the AASA and it may be used directly later. Do not add
// another path here without checking hasat-mobile for a matching screen
// (or a +native-intent redirect to one) first — an unclaimed/unmapped path
// opens the app to a blank "unmatched route" screen.
export const Route = createFileRoute("/.well-known/apple-app-site-association")({
  server: {
    handlers: {
      ANY: async () =>
        new Response(
          JSON.stringify({
            applinks: {
              apps: [],
              details: [
                {
                  appID: "XM562PFC7F.com.hasat.app",
                  paths: ["/tarifler/*", "/recipe/*"],
                },
              ],
            },
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
    },
  },
});
