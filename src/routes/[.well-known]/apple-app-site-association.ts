import { createFileRoute } from "@tanstack/react-router";

// T1 Faz 2 — iOS Universal Links. Served extension-less at
// /.well-known/apple-app-site-association (Apple's `swcd` fetches exactly
// this path, no `.json`), as raw JSON with no redirect — mirrors the
// sibling `oauth-protected-resource.ts` file-route shape in this same
// `[.well-known]` directory, applied by hand since this has nothing to do
// with MCP.
//
// `paths` only lists `/recipe/*`, the one mobile route (hasat-mobile's
// `app/recipe/[slug].tsx`) verified against the actual hasat-mobile repo.
// It does NOT list `/tarifler/*`, the real web path recipes render at
// (tarifler.$slug.tsx) — hasat-mobile has no route/linking config mapping
// that path to a screen today, so a Universal Link to it would open the
// app to a blank "unmatched route" screen. See PR description for the
// full web<->mobile path audit; do not add another path here without
// checking hasat-mobile for a matching screen first.
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
                  paths: ["/recipe/*"],
                },
              ],
            },
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
    },
  },
});
