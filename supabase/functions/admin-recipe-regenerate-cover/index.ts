// Admin cover regeneration — generate a candidate cover with the F2 image building blocks, let an
// admin preview it, then apply (or discard) it.
//
// Same human-facing admin-dashboard auth convention as ../admin-recipe-quality/index.ts and every
// other admin-recipe-* function: timing-safe `x-admin-key` compared against `ADMIN_DASHBOARD_KEY`,
// service-role internally, verify_jwt=false (supabase/config.toml). The auth gate, routes and
// actions all live in ../_shared/recipe-automation/admin/regenerate-cover.ts (see its header for
// the route list) so they are unit-testable; this file is only the Deno.serve shell.
import { getSupabaseAdminClient } from "../_shared/recipe-automation/infra/supabase-admin.ts";
import { serveRegenerateCover } from "../_shared/recipe-automation/admin/regenerate-cover.ts";

Deno.serve((req) => serveRegenerateCover(req, getSupabaseAdminClient));
