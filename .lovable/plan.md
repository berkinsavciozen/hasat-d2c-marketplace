## Goal
Remove all hardcoded seed/demo data from `src/lib/hasat/store.ts` and verify nothing else inserts sample rows into the DB on mount/onboarding.

## Audit results

**Already empty (no change needed):** `parcels`, `entries`, `listings`, `offers`, `orders`, `subscriptions`, `priceAlerts`, `pendingOffer` all initialize to `[]`/`null` in the Zustand store. No `useEffect` anywhere inserts demo rows. Onboarding only writes the user's own profile + chosen certifications — that's real user data, not seed.

**Hardcoded fallback arrays still present in `src/lib/hasat/store.ts`:**
1. `seedPrices` (5 fake price points) — used by `farmer.prices.tsx` and read via `s.prices`. There is no real Supabase query for `price_points`, so removing this leaves the page with no data source.
2. `seedProducers` (4 fake producer profiles with listings/reviews/yield history) — used by `buyer.producer.$id.tsx` and `buyer.subscription.$producerId.tsx`. There is no real producers query.
3. `seedNotifPrefs` — defaults for the notif preferences screen. Not demo content per se (defaults), but the user listed nothing about notif prefs; **leave as-is**.
4. `setRole` mints a fake user with hardcoded name (`"Mehmet Yılmaz"` / `"Ayşe Demir"`) and phone `+90 555 000 0000`. Overwritten by real `updateUser` immediately after, but the hardcoded literals are demo content.

## Changes

### `src/lib/hasat/store.ts`
- Delete `seedParcels`, `seedEntries`, `seedListings`, `seedPrices`, `seedOffers`, `seedProducers`, `seedOrders` constants and the `ts` / `tlSteps` helpers (only used by `seedOrders`).
- In the store's initial state, change `prices: seedPrices` → `prices: []` and `producers: seedProducers` → `producers: []`.
- In `setRole`, drop the hardcoded `name`/`phone`/`city` literals — set only `{ id, role, premium: false }` and let `updateUser` populate the rest from real auth/profile data.
- Keep `seedNotifPrefs` (it represents default toggles, not demo content) unless you want it removed too.

### Consumer guards (minimum needed so empty arrays don't crash)
With `prices = []` and `producers = []`, three screens currently assume a non-empty array:
- `src/routes/farmer.prices.tsx` line 35 dereferences `selected.crop` after `prices[0]` — will crash. Needs a `if (prices.length === 0) return <EmptyState/>;` early-return using the project's existing empty-state component.
- `src/routes/buyer.producer.$id.tsx` and `src/routes/buyer.subscription.$producerId.tsx` already use `find(...)` — they'll show "producer not found", which is acceptable.

The user's instruction is "do not replace seed logic with anything — empty states already exist." The producer pages are fine. **Open question:** `farmer.prices.tsx` does not currently have an empty-state branch — it will throw on `selected.crop` when `prices` is empty. I will add a minimal early-return rendering the project's existing empty-state pattern (no new UI design, copy existing pattern from another farmer screen) to avoid a runtime crash.

## Out of scope
- No changes to Supabase queries, RLS, onboarding flow, or any UI design.
- No edits to `queries.ts` (already DB-backed for parcels, listings, offers, orders, entries, alerts, subscriptions, community posts, notifications).
