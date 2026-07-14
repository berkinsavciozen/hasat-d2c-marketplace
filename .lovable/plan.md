## Investigation findings

- **Existing tool pattern** (`create-offer.ts`, `mark-transfer-sent.ts`, etc.): each file exports one `defineTool`; uses a local `supabaseForUser(ctx)` helper (RLS-only, no service-role); write tools call `enforceMcpRateLimit(sb)` first; sensitive/destructive ones require `confirm: z.literal(true)` and set `destructiveHint: true`.
- **`useCreatePost`** (queries.ts:1844) inserts `{ author_id, content, category, flagged_for_review: looksLikePriceCoordination(content) }`. Category column defaults to `'Genel'` in DB. Note: JS layer sets `flagged_for_review` client-side; the DB `enforce_community_moderation` trigger will also re-compute it — safe either way. I'll set it client-side to match the real mutation exactly.
- **`useMySubscriptions`** (queries.ts:1685) is **buyer-only** — filters strictly by `buyer_id = auth.uid()`. There is NO farmer-side variant. I'll mirror this exactly: the MCP tool returns the caller's own subscriptions as a buyer. If the caller is a farmer with no rows as buyer, they get an empty list. (Flagging this: user asked "whichever role" but the real hook only scopes to buyer — I'm mirroring real behavior, not inventing a farmer path.)
- **`useCreateSubscription`** (queries.ts:1702) — exact insert shape captured below.
- **`useCancelSubscription`** (queries.ts:1733) — **buyer-only** (`update status='cancelled' WHERE id=? AND buyer_id=auth.uid()`). No farmer cancel path exists. MCP tool will mirror this: only the buyer who owns it can cancel.

## Files to add (5 new tool files)

All under `src/lib/mcp/tools/`, all import `enforceMcpRateLimit` from `./_rate-limit` for writes, all use the standard `supabaseForUser` helper.

### 1. `create-community-post.ts` (write, rate-limited)
```
name: "create_community_post"
title: "Create community post"
description: "Publish a new post to the Hasat community feed as the signed-in user."
inputSchema:
  content: z.string().trim().min(1).max(2000)
  category: z.string().trim().min(1).default("Genel")
annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
```
Handler: auth check → rate limit → `sb.from("community_posts").insert({ author_id: userId, content, category, flagged_for_review: looksLikePriceCoordination(content) })`. Import `looksLikePriceCoordination` from `@/lib/hasat/queries`.

### 2. `list-community-posts.ts` (read)
```
name: "list_community_posts"
title: "List community posts"
description: "List recent top-level community posts (replies excluded), newest first."
inputSchema:
  limit: z.number().int().min(1).max(100).default(20)
annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }
```
Handler: query top-level posts (`parent_id IS NULL`), order by `created_at desc`, limit. Mirror the real UI's behavior for `flagged_for_review`: the real `useCommunityPosts` returns them and the UI decides — RLS already governs visibility, so I'll return the same fields (`id, author_id, content, category, likes_count, comments_count, created_at, flagged_for_review`). No client-side masking beyond what RLS does — matches real app.

### 3. `create-subscription.ts` (write, rate-limited, SENSITIVE)
```
name: "create_subscription"
title: "Create harvest subscription"
description: "SENSITIVE — commit as the signed-in buyer to an ongoing harvest subscription with a farmer. Cannot be reversed via this tool (use cancel_subscription). Requires confirm=true."
inputSchema:
  farmer_id: z.string().uuid()
  volume_commitment: z.number().positive()
  price_lock: z.boolean()
  locked_price: z.number().positive().optional()
  next_harvest_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
  estimated_qty: z.number().positive().optional()
  confirm: z.literal(true)
annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false }
```
Handler mirrors `useCreateSubscription` exactly:
```
insert({
  buyer_id: userId,
  farmer_id,
  volume_commitment,
  price_lock,
  locked_price: price_lock ? (locked_price ?? null) : null,
  locked_at: price_lock ? new Date().toISOString() : null,
  next_harvest_date: next_harvest_date ?? null,
  estimated_qty: estimated_qty ?? null,
  status: "active",
})
```

### 4. `list-my-subscriptions.ts` (read)
```
name: "list_my_subscriptions"
title: "List my subscriptions"
description: "List the signed-in buyer's harvest subscriptions (all statuses), newest first."
inputSchema: { } (no params)
annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }
```
Handler mirrors `useMySubscriptions`: `select("*, farmer:profiles!harvest_subscriptions_farmer_id_fkey(id,name,city)").eq("buyer_id", userId).order("created_at", desc)`. Buyer-only — flagged above.

### 5. `cancel-subscription.ts` (write, rate-limited, SENSITIVE)
```
name: "cancel_subscription"
title: "Cancel subscription"
description: "SENSITIVE — cancel one of the signed-in buyer's harvest subscriptions. Only the buyer who created the subscription can cancel it. Requires confirm=true."
inputSchema:
  subscription_id: z.string().uuid()
  confirm: z.literal(true)
annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false }
```
Handler mirrors `useCancelSubscription`: `update({ status: "cancelled" }).eq("id", subscription_id).eq("buyer_id", userId).select().maybeSingle()`. If null → "Subscription not found or not owned by you." error.

## Files to edit (1)

- `src/lib/mcp/index.ts` — import the 5 new tools and append to the `tools: []` array.

## Post-build steps

1. Run `app_mcp_server--extract_mcp_manifest` to regenerate `.lovable/mcp/manifest.json` (auto-generated, never hand-edited).
2. `bunx tsgo --noEmit` — expect clean.
3. Quick verification via `supabase--insert` seeding 30 `mcp_tool_calls` rows for a test user + one live-shape SQL call is unnecessary since rate-limit path is already verified from the previous turn; instead spot-check by SQL: confirm a manual `INSERT INTO harvest_subscriptions` with the exact shape above succeeds under RLS, and confirm `UPDATE harvest_subscriptions SET status='cancelled' WHERE id=? AND buyer_id=?` matches the RLS policy currently on the table.

## Confirmations for you before I build

- **Farmer-side list/cancel not included** — real app has no such mutation; I'm not inventing one. If you want farmers to be able to view/cancel-on-their-side via MCP, that needs a matching real-app mutation first — say the word and I'll flag it as out-of-scope for this pass.
- **`category` defaults to `"Genel"`** to match the DB column default.
- **No moderation logic added** — trigger + client-side rule mirror each other, safe.
