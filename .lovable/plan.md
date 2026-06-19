# Demo polish

## 1. Page titles

Existing routes use `head: () => ({ meta: [{ title: "X — Hasat" }] })`. The user's spec uses `|` (pipe) as separator — I'll standardize to that exact format on the listed routes. (Note: there is no `farmer.analitik.tsx`; the file is `farmer.analytics.tsx` — I'll target that.)

| Route | Current | New |
| --- | --- | --- |
| `farmer.prices.tsx` | "Fiyatlar — Hasat" | "Fiyat Takibi \| Hasat" |
| `farmer.analytics.tsx` | (no head) | "Analitik \| Hasat" |
| `buyer.subscriptions.tsx` | "Aboneliklerim — Hasat" | "Aboneliklerim \| Hasat" |
| `farmer.community.tsx` | (no head) | "Topluluk \| Hasat" |
| `buyer.reports.tsx` | "Raporlar — Hasat" | "Raporlar \| Hasat" |

For the two routes missing `head` entirely (analytics, community), add it to the existing `createFileRoute` config — same shape as the other three.

## 2. Mobile (390px) overflow fixes

### `NegotiationTimeline.tsx` (used in 4 places — fix once, propagate everywhere)

- **Total row** (line 140–155): the `Toplam` label + total + diff badge can exceed card width with large numbers. Allow the right cluster to wrap: change the right `<span>` from `flex items-baseline gap-2` to `flex flex-wrap items-baseline justify-end gap-x-2 gap-y-0.5 min-w-0`. Add `min-w-0` on the parent.
- **Header row** (line 104–116): "Tur N · Sen" + date + "Güncel" pill can crowd. Add `flex-wrap gap-y-1` on the outer flex; add `shrink-0` to the date span and the Güncel pill so the round/author label is the only thing that can shrink.
- **`Field` component** (line 165–188): in `grid-cols-2` cells, long values like `₺18.000,00/kg` or a date string can push the cell wider than 50%. Make value side truncate: wrapper `flex items-baseline gap-1.5 min-w-0`; label `shrink-0`; value `truncate min-w-0`.

These changes flow automatically into the farmer counter form, farmer orders list compact strip, buyer Tekliflerim card compact strip, and buyer negotiation page — all of which render the same component.

### Buyer Tekliflerim action buttons (`buyer.orders.tsx` line 141)

Change `<div className="mt-4 grid grid-cols-2 gap-2">` to `<div className="mt-4 flex flex-col gap-2 sm:grid sm:grid-cols-2">`. Stacks on mobile, side-by-side from `sm:` (640px) up — so 390px gets the vertical layout.

### Farmer journal stats bar (`farmer.journal.index.tsx` line 118–129)

The bar is `flex items-center justify-between`; the left side is one inline-text run (`{n} kayıt · {n} parsel · Son: {date}`) and the right is a "+ Parsel" button. On 390px, the long Turkish "Son:" suffix can push the button off-screen. Fix: change the outer to `flex flex-wrap items-center justify-between gap-x-3 gap-y-1`, add `min-w-0` to the left text container, and `shrink-0` to the button. (No font-size or padding tweaks — the user explicitly said no design changes.)

# Files touched

- `src/routes/farmer.prices.tsx` — title text
- `src/routes/farmer.analytics.tsx` — add `head`
- `src/routes/buyer.subscriptions.tsx` — title text
- `src/routes/farmer.community.tsx` — add `head`
- `src/routes/buyer.reports.tsx` — title text
- `src/components/hasat/NegotiationTimeline.tsx` — flex-wrap + min-w-0 + truncate
- `src/routes/buyer.orders.tsx` — `flex-col sm:grid` button row
- `src/routes/farmer.journal.index.tsx` — flex-wrap stats bar

No new components, no logic changes.
