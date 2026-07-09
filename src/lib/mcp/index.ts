import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listListingsTool from "./tools/list-listings";
import listHarvestsTool from "./tools/list-harvests";
import listOffersTool from "./tools/list-offers";
import createHarvestTool from "./tools/create-harvest";
import createParcelTool from "./tools/create-parcel";
import listParcelsTool from "./tools/list-parcels";
import publishListingTool from "./tools/publish-listing";
import listOffersOnMyListingsTool from "./tools/list-offers-on-my-listings";
import respondToOfferTool from "./tools/respond-to-offer";
import confirmPaymentReceivedTool from "./tools/confirm-payment-received";
import browseMarketplaceTool from "./tools/browse-marketplace";
import createOfferTool from "./tools/create-offer";
import respondToCounterTool from "./tools/respond-to-counter";
import listMyOffersTool from "./tools/list-my-offers";
import markTransferSentTool from "./tools/mark-transfer-sent";
import listMyOrdersTool from "./tools/list-my-orders";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "hasat-mcp",
  title: "Hasat",
  version: "0.2.0",
  instructions:
    "Tools for Hasat, a Turkish D2C agriculture marketplace. The signed-in user is a farmer or buyer; RLS scopes every read/write to their own data. " +
    "Farmer tools: manage parcels (create_parcel, list_my_parcels), harvest journal (create_harvest_entry, list_recent_harvests), listings (list_my_listings, publish_listing), and incoming offers / payments (list_offers_on_my_listings, respond_to_offer, confirm_payment_received). " +
    "Buyer tools: discover listings (browse_marketplace), submit / negotiate / pay for offers (create_offer, respond_to_counter, list_my_offers, mark_transfer_sent, list_my_orders). " +
    "Shared: list_pending_offers. " +
    "Sensitive tools (respond_to_offer, respond_to_counter, confirm_payment_received, mark_transfer_sent) require an explicit confirm=true flag because their effects are not reversible via MCP.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listListingsTool,
    listHarvestsTool,
    listOffersTool,
    createHarvestTool,
    createParcelTool,
    listParcelsTool,
    publishListingTool,
    listOffersOnMyListingsTool,
    respondToOfferTool,
    confirmPaymentReceivedTool,
    browseMarketplaceTool,
    createOfferTool,
    respondToCounterTool,
    listMyOffersTool,
    markTransferSentTool,
    listMyOrdersTool,
  ],
});
