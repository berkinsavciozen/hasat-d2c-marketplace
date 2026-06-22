# P10 — Farmer AI Chat (FAB + Panel)

## Inspection findings

- **Bottom nav** (`src/routes/farmer.tsx`): `fixed bottom-0 inset-x-0 z-40`, `grid-cols-5`, `py-2 pb-safe`, dark background. Effective height ≈ 56px + safe-area. Main content uses `pb-24 md:pb-0`.
- **No existing FAB** in farmer interface. New pattern.
- **LOVABLE_API_KEY** is server-only (used in `whatsapp-ai-webhook` edge function). Cannot call gateway directly from browser. Need a server proxy.
- **Existing edge function pattern** uses `https://ai.gateway.lovable.dev/v1/chat/completions` with `Lovable-API-Key` header and `google/gemini-3-flash-preview`.
- **Auth**: `useAuthUserId()` hook reads `supabase.auth.getUser()`.
- **Zustand store** holds a synthetic `user` (`id: "u1"`) — NOT the real auth user. Tier/premium flag in store may exist but is unreliable for the real DB user. Plan: read real `user_id` via `useAuthUserId`, fetch `profiles.tier` + `profiles.name` + `profiles.city` once via existing `useProfile()` query.
- **TanStack route**: current path via `useRouterState({ select: s => s.location.pathname })`.

## Plan

### 1. New edge function: `supabase/functions/ai-chat-stream/index.ts`

- `verify_jwt = true` (in `supabase/config.toml`) — only authenticated farmers can call.
- Accepts `POST { messages: ChatMessage[], systemPrompt: string }`.
- Streams Lovable AI Gateway response back to browser as SSE (pass-through). Sets `Content-Type: text/event-stream`, forwards the upstream ReadableStream chunk-by-chunk.
- Handles `429` / `402` by emitting a single SSE error event the client can render.
- Does NOT touch DB — gating + storage happens client-side per spec.

### 2. New components

```
src/components/hasat/ai-chat/
  AIChatFAB.tsx          – fixed FAB, lav #8B9BF0, bottom: calc(56px + safe-area + 16px) on mobile, bottom: 24px on md+
  AIChatPanel.tsx        – Sheet (side="bottom"), 80vh, hosts header + meter + list + input
  ChatHeader.tsx         – ✨ Hasat AI · session indicator · Yeni Sohbet · Geçmiş · close
  ChatMessageList.tsx    – auto-scroll, typing indicator, markdown (basic bold + line breaks)
  ChatMessageBubble.tsx  – user (saffron, right) / assistant (dark + lav left border, left)
  ChatInput.tsx          – textarea + send; disabled at limit / offline
  UsageMeter.tsx         – free tier only; X/50; green/amber/red thresholds
  SessionHistorySheet.tsx – list of sessions (date + first message preview)
  CoachMark.tsx          – tooltip; localStorage `hasat_ai_chat_coach_dismissed`
  useAIChat.ts           – hook: session state, messages, send(), stream parsing, RPC calls
```

### 3. Injection

Append a single `<FarmerAIChat />` wrapper in `src/routes/farmer.tsx` after the mobile More sheet (purely additive, before closing root div). It internally renders FAB + panel and is gated to the farmer layout only.

### 4. `useAIChat` hook flow

- On panel open with no current session: load most recent `session_id` for user where `source='in_app'` from `ai_chat_messages` (latest `created_at`); if exists, load all its messages; if none, generate fresh UUIDv4.
- "Yeni Sohbet": set new UUIDv4, clear messages.
- On send:
  1. `await supabase.rpc('can_send_ai_message', { _user_id })` → if false, set limit-reached flag, abort.
  2. Insert user row into `ai_chat_messages` (role `user`, `source='in_app'`, `page_context = pathname`, `session_id`).
  3. Build payload: system prompt (filled with name/city/tier/page; on first send of session also include context block: last 5 `harvest_entries`, active `listings`, pending `offers` count + oldest, `parcels [id,name]`) + last 10 messages of session.
  4. `fetch('/functions/v1/ai-chat-stream', { headers: { Authorization: Bearer <session.access_token> } })`, parse SSE: read `data: {choices:[{delta:{content}}]}` lines, append tokens to a streaming assistant bubble.
  5. On `[DONE]`: insert assistant row to `ai_chat_messages`; `await supabase.rpc('increment_ai_usage', { _user_id })`; update meter count with returned int.
  6. On stream error: show inline error toast in panel; do NOT insert assistant row.

### 5. Usage meter

- Query `ai_usage_tracking` for `(user_id, current YYYY-MM)` on panel open (free tier only).
- Local count updates from `increment_ai_usage` return value.
- At 50: input disabled, "Mesaj limitine ulaştınız. Premium'a geç →" link to `/farmer/premium`.
- Premium: meter not rendered.

### 6. Coach mark

- On FAB mount: if `localStorage.hasat_ai_chat_coach_dismissed !== '1'` AND user has zero rows in `ai_chat_messages` (cheap `head: true, count: 'exact'` query, limit 1), show tooltip. Dismiss on any tap → set flag.

### 7. Styling

- FAB: 56px round, bg `#8B9BF0`, white sparkle icon (`Sparkles` from lucide), shadow-lg, `z-50` (above nav `z-40`). Position:
  - mobile: `right-4 bottom-[calc(56px+env(safe-area-inset-bottom)+16px)]`
  - desktop: `right-6 bottom-6`
- Panel uses existing shadcn `Sheet` with `side="bottom"` + `h-[80vh] rounded-t-2xl`.
- User bubble: `bg-saffron text-white`. Assistant: `bg-card border-l-2 border-[#8B9BF0]`.

### 8. Constraints respected

- No DB schema changes.
- No changes to existing pages, routing, navigation.
- `[JOURNAL_ENTRY]` block rendered as plain text (P11 will handle).
- Buyer routes unaffected (component only mounted inside `/farmer` layout).
- Panel state in local React state (no Zustand).

### 9. Files touched

- **New**: `supabase/functions/ai-chat-stream/index.ts`, 9 component files under `src/components/hasat/ai-chat/`.
- **Edited**: `supabase/config.toml` (register function), `src/routes/farmer.tsx` (one-line mount of `<FarmerAIChat />`).

### 10. Verification

- Type-check + manual test: send message as test farmer `0868e4fe-86d2-4c5d-8ba5-f15fd4fac146`, confirm streaming, confirm row count in `ai_chat_messages` increments by 2 per exchange, confirm `ai_usage_tracking.message_count` increments.
