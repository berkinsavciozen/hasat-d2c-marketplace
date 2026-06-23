## P12 — AIBox: AI Insight Card on Farmer Pages

### Findings

- **Dashboard** = `src/routes/farmer.home.tsx` (route `/farmer/home`). Header is `<FarmerHeader title=... />`. Main content begins inside the next `<div className="p-4 md:p-8 space-y-4">`. Already uses `useEntries()` + `useFarmerListings()` queries — TanStack Query is wired.
- **Analitik** = `src/routes/farmer.analytics.tsx` (route `/farmer/analytics`). `<FarmerHeader>` then a single `<div className="p-4 md:p-8">` with placeholder. AIBox slots at the top of that div.
- **Edge fn pattern** (`ai-chat-stream/index.ts`): POSTs to `https://ai.gateway.lovable.dev/v1/chat/completions` with `Lovable-API-Key` + `Authorization: Bearer ${LOVABLE_API_KEY}` headers, model `google/gemini-3-flash-preview`. For AIBox we set `stream: false`, `response_format: { type: "json_object" }`, and parse `choices[0].message.content` as JSON. Same CORS preflight handler.
- **Auth in edge fn**: `verify_jwt = true` means JWT is verified but user id isn't auto-exposed. Read `Authorization` header, decode the JWT payload (middle segment, base64url) to extract `sub` as `user_id`. Use service-role Supabase client (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` from env) for all data fetches.
- **Tokens**: defined in `src/styles.css` as CSS vars (`--lav: #8B9BF0`, `--saffron: #C8833B`, `--gold`, `--dark`, `--hwhite`). Use `var(--lav)` etc. — no `C.*` constants file in the project.
- **Auth hook**: `useAuthUserId` exported from `src/lib/hasat/queries.ts`, safe to use in page-level components.
- **Chat deeplink**: `FarmerAIChat` owns local `open` state — no exposed trigger. Establish a tiny `window.dispatchEvent(new CustomEvent("hasat:ai-chat:open", { detail: { prefill } }))` mechanism. `FarmerAIChat` adds a listener that calls `setOpen(true)` and seeds the draft. AIBox dispatches on insight tap.
- **Query caching**: existing hooks don't set staleTime explicitly (defaults). For AIBox we explicitly pass `staleTime: 300_000` + `gcTime: 300_000`, key `["ai-box", page, userId]`. `enabled: !!userId`.

### Edge function: `supabase/functions/ai-box-insights/index.ts`

- `verify_jwt = true` (add to `supabase/config.toml`).
- POST `{ page_type: "dashboard" | "analytics" | ... }`.
- Extract `user_id` by base64url-decoding the JWT payload from the `Authorization: Bearer …` header (no signature re-verify; gateway already verified).
- Service-role Supabase client to fetch per-page context:
  - **dashboard**: profile (name/city/tier), listings counts (`status='active'` vs total), pending offers count + oldest `created_at`, active orders + any needing farmer action, harvest_entries last 30d count, unread notifications count.
  - **analytics**: harvest_entries last 90d grouped by crop (sum qty, avg quality), revenue potential from active listings, completed orders last 90d (count + total), tier.
- If context is empty (new farmer, no entries/listings/offers/orders) → return `{ insights: [], urgency: null, empty: true }` with HTTP 200.
- Call Lovable AI Gateway, non-streaming, `response_format: json_object`, with the system prompt from the spec (page_type + context_json interpolated).
- On AI failure / malformed JSON / parse error: return `{ insights: [], urgency: null, error: true }` HTTP 200 (never break the client).
- Standard CORS headers, OPTIONS preflight.

### Component: `src/components/hasat/AIBox.tsx`

- Props: `{ page: "dashboard" | "analytics" | "journal" | "prices" | "storefront" }`.
- `useAuthUserId()` + `useQuery({ queryKey: ["ai-box", page, userId], queryFn: callEdgeFn, enabled: !!userId, staleTime: 300_000, gcTime: 300_000, retry: false })`.
- `callEdgeFn`: gets current session via `supabase.auth.getSession()`, POSTs to `${SUPABASE_URL}/functions/v1/ai-box-insights` with `Authorization: Bearer ${access_token}`, `apikey: ${publishable}`, body `{ page_type: page }`. Mirrors the fetch shape used in `useAIChat.ts`.
- Local state: `collapsed` initialized from `localStorage["hasat_aibox_${page}_collapsed"]` (default false). Setter persists.
- Render branches:
  - `userId` missing or `error` flagged or fetch throws → `return null` (silent fail).
  - Loading → card with header "✨ AI Analiz" (pulsing) + 3 shimmer skeleton lines (lav-tinted, varied widths).
  - `empty: true` → single card, no collapse, text "Henüz yeterli veri yok. Günlük kaydı ekledikçe AI önerilerin kişiselleşecek."
  - Expanded → header (sparkle icon `var(--lav)` + "AI Analiz" + chevron-up button right). If `urgency`, amber banner (`background: color-mix(in oklab, var(--gold) 30%, white)`) full-width bold. Then 2–3 insight rows; each a `<button>` with lav bullet + text. Tap → `window.dispatchEvent(new CustomEvent("hasat:ai-chat:open", { detail: { prefill: 'Bu konuda daha fazla bilgi ver: ' + insight }}))`.
  - Collapsed → header row with first insight truncated to 60 chars + "…" and chevron-down.
- Styling: `rounded-xl`, background `color-mix(in oklab, var(--lav) 10%, var(--card))`, `border-l-[3px] border-l-[var(--lav)]`, padding 12–16, `mb-4`. Distinct from generic `<Card>`.

### Chat deeplink wiring (`FarmerAIChat.tsx`)

- Add `useEffect` listening for `hasat:ai-chat:open`: `setOpen(true)`, then `setDraft(detail.prefill ?? "")`, focus input. Cleanup removes listener.
- No other changes; existing FAB / panel logic untouched.

### Page integration

- `farmer.home.tsx`: import `AIBox`, render `<AIBox page="dashboard" />` as the first child of the `<div className="p-4 md:p-8 space-y-4">` (above the quick-actions strip).
- `farmer.analytics.tsx`: import `AIBox`, render `<AIBox page="analytics" />` as the first child of the `<div className="p-4 md:p-8">` (above the empty-state card).

### Config

- `supabase/config.toml`: append `[functions.ai-box-insights]\nverify_jwt = true`.

### Files

- New: `supabase/functions/ai-box-insights/index.ts`
- New: `src/components/hasat/AIBox.tsx`
- Edited: `supabase/config.toml`
- Edited: `src/components/hasat/ai-chat/FarmerAIChat.tsx` (deeplink listener only)
- Edited: `src/routes/farmer.home.tsx`, `src/routes/farmer.analytics.tsx` (single mount line each)

### Out of scope

No DB/RLS changes. No edits to `ai-chat-stream`, `useAIChat`, journal flow, or other pages. No usage-meter increment. P13 covers journal/prices/storefront integration.

### Verification

1. Dashboard → shimmer then 2–3 Turkish insights below header.
2. Analitik → same.
3. Collapse → reload → still collapsed (per-page localStorage).
4. Tap insight → AI Chat panel opens with "Bu konuda daha fazla bilgi ver: …" in input.
5. Fresh farmer → empty-state card.
6. Within 5 min, route away/back → no refetch (React Query devtools or network tab).
7. Block the function (offline) → page renders normally, no AIBox, no error toast.
