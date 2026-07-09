import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listListingsTool from "./tools/list-listings";
import listHarvestsTool from "./tools/list-harvests";
import listOffersTool from "./tools/list-offers";
import createHarvestTool from "./tools/create-harvest";

// The OAuth issuer must be the direct Supabase host, not the .lovable.cloud proxy.
// Inlined at build time via Vite; the fallback keeps the issuer well-formed
// during the throwaway manifest-extract eval.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "hasat-mcp",
  title: "Hasat",
  version: "0.1.0",
  instructions:
    "Tools for Hasat, a Turkish D2C agriculture marketplace. The signed-in user is a farmer or buyer. Use `list_my_listings`, `list_recent_harvests`, and `list_pending_offers` to read the user's data, and `create_harvest_entry` to log a new harvest for the farmer's parcel.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listListingsTool, listHarvestsTool, listOffersTool, createHarvestTool],
});
