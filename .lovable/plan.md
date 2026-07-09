## Investigation findings

**Sort logic (item 7):**
- `buyer.discover.tsx` shows a "Puan / Ucuz / Yakın" chip UI (`sort` state) but the chips are never applied to the filtered list — the actual order comes from `useActiveListings()` in `src/lib/hasat/queries.ts` which does `.order("created_at", { ascending: false })` — newest listings first.
- `src/routes/s.$slug.tsx` (public farmer storefront) also orders by `created_at` DESC.
- No paid/featured placement exists today. Disclosure copy will say "en yeni ilanlar en üstte" — plus a `// TODO` code comment about a future "Sponsorlu" label if paid placement is ever introduced.

**WhatsApp AI prompt (item 4):**
- Lives in `supabase/functions/whatsapp-ai-webhook/index.ts` (an existing edge function, kept for the Twilio inbound webhook that must land at a Supabase URL — will not be migrated).
- In-app system prompt lives in `src/components/hasat/ai-chat/useAIChat.ts` (`buildSystemPrompt`). Both need the same anti-price-recommendation guardrail.

**price_feed RLS (item 1):** Confirmed — `Public read price feed` with `qual: true`, plus a `GRANT SELECT ... TO anon, authenticated`. Raw rows including `recorded_by` and `recorded_at` are directly queryable.

## Plan

### 1. Migration — lock down price_feed + aggregate RPC
- `REVOKE SELECT ON public.price_feed FROM anon, authenticated;` (keep GRANT to `service_role` and INSERT to `authenticated`).
- Drop policy `Public read price feed`. Add policy `Farmers read own price feed rows` (`FOR SELECT USING (recorded_by = auth.uid())`) so a farmer can still see their own history (and re-`GRANT SELECT ON public.price_feed TO authenticated` — the RLS policy restricts what they actually see).
- Create SECURITY DEFINER function `public.get_price_feed_summary(p_crop text)` returning `TABLE(crop_name text, avg_price numeric, stddev_price numeric, distinct_farmer_count int, last_updated timestamptz, insufficient_data boolean)`:
  - Case-insensitive trim match on `crop_name`, window `recorded_at >= now() - interval '30 days'`.
  - `distinct_farmer_count = COUNT(DISTINCT recorded_by)`.
  - If `distinct_farmer_count < 5` → return `NULL` for avg/stddev and `insufficient_data = true`; else return real numbers with `insufficient_data = false`.
  - `SET search_path = public`, `LANGUAGE sql STABLE`.
- `GRANT EXECUTE ON FUNCTION public.get_price_feed_summary(text) TO anon, authenticated`.

### 2. Migration — community_posts moderation column
- `ALTER TABLE public.community_posts ADD COLUMN flagged_for_review boolean NOT NULL DEFAULT false;`.
- No RLS change (rendering does the masking so the author can still read their own text).

### 3. Client — replace direct price_feed reads
- `usePriceFeed(crop?)` in `src/lib/hasat/queries.ts` becomes a summary hook: `supabase.rpc("get_price_feed_summary", { p_crop: crop })`. Returns `{ avgPrice, stddevPrice, distinctFarmerCount, lastUpdated, insufficientData }` (or `null`).
- `src/routes/farmer.prices.tsx`: replace the per-entry list/sparkline with an aggregate card — average line + ±1σ shaded band; on `insufficient_data` render "Yeterli veri yok (en az 5 farklı üreticiden veri gerekli)".
- No more direct `.from("price_feed")` SELECTs anywhere in client code.

### 4. `MarketDeviationAlert.tsx` — band-based nudge
Rewrite to consume the new summary hook:
- `insufficient_data` → render nothing.
- `price > avg + stddev` → red badge "YÜKSEK" + "Fiyatın piyasa aralığının üzerinde. Gözden geçirmek isteyebilirsin."
- `avg - stddev <= price <= avg + stddev` → neutral badge "UYGUN" + "Fiyatın piyasa aralığında."
- `price < avg - stddev` → amber badge "DÜŞÜK" + "Fiyatın piyasa aralığının altında. Gözden geçirmek isteyebilirsin."
- No suggested-number rendering anywhere.

### 5. AI guardrails
Append the same paragraph to both system prompts (Turkish, plain):

> Fiyat konusunda: bir çiftçi "kaça satayım", "önerdiğin fiyat" gibi bir soru sorarsa ASLA belirli bir sayı önerme, "şu fiyatı koy" / "X TL'ye satmalısın" gibi ifadeler kullanma. Bunun yerine çiftçinin mevcut fiyatının piyasa aralığına göre nerede olduğunu (YÜKSEK / UYGUN / DÜŞÜK) ve aralığı niteliksel olarak (ör. "çoğu üretici bu aralıkta satıyor") anlat. Yeterli veri yoksa (5'ten az farklı üretici) hiçbir piyasa değerlendirmesi yapma, sadece veri yetersiz olduğunu söyle. Kararı çiftçinin verdiğini vurgula.

- `supabase/functions/whatsapp-ai-webhook/index.ts`: inject into `systemPrompt` template + `supabase--deploy_edge_functions` after edit.
- `src/components/hasat/ai-chat/useAIChat.ts`: inject into `buildSystemPrompt`.

### 6. `/terms` — new article
Add a section to `src/routes/terms.tsx` (Turkish, short):
- Başlık: "Rekabet ve Fiyat Koordinasyonu Yasağı".
- İçerik: Hasat platformunu (Topluluk özelliği dahil) diğer üreticilerle satış fiyatı, üretim miktarı ya da hangi alıcıya / bölgeye satış yapılıp yapılmayacağı konularında anlaşmak veya bunları koordine etmek için kullanamazsınız. Bu tür girişimler ilgili hesabın askıya alınmasına yol açabilir.

### 7. Community moderation — flag + mask
In `useCreatePost` / `useCreateReply` (`src/lib/hasat/queries.ts`):
- After building `content`, run a rule-based check: lowercase text contains at least one currency term (`₺`, ` tl`, `$`) AND at least one coordination term (`anlaşalım`, `birlikte`, `hepimiz`, `sabit fiyat`, `taban fiyat`). Both classes must match, no NLP.
- If matched, insert with `flagged_for_review: true`. Do NOT block the insert.
- In `farmer.community.tsx` rendering: if `post.flagged_for_review && post.author_id !== currentUserId`, replace body with "Bu gönderi incelemede." (author still sees original). Same rule applied to replies (add column to `community_post_replies` if it exists; will inspect during implementation and mirror if present).

### 8. Ranking disclosure
Add a small one-liner in three places (identical wording, buyer-facing variant on discover):
- Farmer: "İlanlar en yeni tarihe göre sıralanır."
- Buyer: "İlanlar en yeni tarihe göre sıralanır. Ücretli öne çıkarma yoktur."
- Places: (a) `src/routes/index.tsx` marketplace preview section, (b) `src/routes/farmer.storefront.tsx` header area, (c) `src/routes/buyer.discover.tsx` above the list.
- Add `// TODO: paid featured placement (future) must render a "Sponsorlu" badge and be excluded from the default "newest first" order.` near the sort/ordering code in `queries.ts`.

### 9. Data export in farmer settings
New "Verilerim" section in `src/routes/farmer.settings.tsx` with a "Verilerimi İndir" button.
- On click: query current farmer's `parcels`, `harvest_entries`, `listings`, `certifications` (RLS scopes to own rows).
- Build `{ exported_at, farmer_id, parcels, harvest_entries, listings, certifications }`, `JSON.stringify(..., null, 2)`, `new Blob([...], { type: "application/json" })`, anchor download named `hasat-verilerim-YYYY-MM-DD.json`.
- No new server code, no new dependencies.

### 10. Verify
- `tsgo` typecheck at the end.
- `supabase--deploy_edge_functions ["whatsapp-ai-webhook"]` after the prompt edit.

### Order of operations
1. `supabase--migration` for items 1 + 2 (single migration, awaits approval).
2. After approval + types regen: client edits (3, 4, 5 in-app, 6, 7, 8, 9).
3. `supabase--deploy_edge_functions` for the WhatsApp prompt update.
4. `tsgo`.
