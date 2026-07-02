# Fix: Infinite Spinner on Buyer Pay Page

## Root cause

`src/routes/buyer.pay.$offerId.tsx` gates rendering with:

```ts
if (isPending || isFetching || !offers) return <LoadingDots />
```

Two problems:

1. **No `isError` handling.** `useBuyerOffers()` runs a join
   `profiles!offers_farmer_id_fkey(id,name,city,iban,bank_account_name)`.
   If that select throws (e.g. `iban` / `bank_account_name` column not
   yet present, RLS rejects the join, or PostgREST parse error), the
   hook enters error state — `data` stays `undefined`, so `!offers` is
   true forever → infinite spinner. No further network request is made.
2. **`isFetching` in gate.** Any background refetch flips `isFetching`
   back to true and re-shows the spinner over already-loaded data.

The order summary and the IBAN both come from the same query, so a bank
join failure kills the whole page.

## Fix

Scope: `src/routes/buyer.pay.$offerId.tsx` only. No query/schema changes.

1. Pull `isError`, `error`, `refetch` from `useBuyerOffers()`.
2. Change the loading gate to `isPending` only (drop `isFetching`).
3. Add an 8-second timeout via `useEffect` + `setTimeout` while
   `isPending` is true; on fire, set `timedOut = true`.
4. Render an error card ("Sayfa yüklenemedi — geri dön") with a Back
   button and a Retry button (`refetch()`) when `isError || timedOut`.
5. Make IBAN rendering fully null-safe: if `offer.farmerIban` is
   missing OR the earlier lookup threw, keep showing the Sipariş
   Özeti card and render the existing "Çiftçi henüz IBAN eklememiş"
   warning inside the payment card (already implemented — just make
   sure it isn't gated behind the failing query). Wrap the IBAN block
   in a small `try { ... } catch {}` around `formatIbanDisplay` /
   clipboard access so a malformed string can't crash render.
6. Keep the existing "Ödemeyi Tamamla (Test)" simulate button intact.

## Verification

- Run `bunx tsgo --noEmit` (project's typecheck) after the edit.
- Manually confirm in preview: page renders order summary even when
  farmer has no IBAN, and shows the timeout/error card instead of
  spinning forever when the underlying query fails.

## Technical notes

- File touched: `src/routes/buyer.pay.$offerId.tsx`.
- No changes to `useBuyerOffers`, no new hook, no schema migration.
- `refetch` from `useQuery` clears error state; reset `timedOut` in the
  retry handler.
