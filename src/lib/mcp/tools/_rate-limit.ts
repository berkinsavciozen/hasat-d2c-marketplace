import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Enforces a shared rate limit across write-tools: 30 calls per authenticated
 * user per rolling 10-minute window. Returns an MCP error content object when
 * the limit is exceeded, or null when the call is allowed.
 *
 * The RPC skips enforcement for service-role / non-authenticated callers.
 */
export async function enforceMcpRateLimit(
  sb: SupabaseClient,
): Promise<{ content: { type: "text"; text: string }[]; isError: true } | null> {
  const { error } = await sb.rpc("check_and_record_mcp_call" as any);
  if (error) {
    return {
      content: [{ type: "text", text: error.message }],
      isError: true,
    };
  }
  return null;
}
