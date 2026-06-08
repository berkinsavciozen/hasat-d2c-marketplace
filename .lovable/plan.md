# Hasat — Foundation + Farmer Vertical Slice

Build the core architecture and the first working vertical slice (Farmer Home + Journal). All other screens will follow in iteration prompts.

## Scope (this plan)

1. **Design system** — Hasat color tokens, typography, Turkish locale formatting
2. **Role routing** — entry/role-picker, FarmerApp + BuyerApp shells with responsive nav
3. **Shared component library** — Btn, Badge, TrustBadge, Card, PriceTicker, OrderTimeline, BottomSheet, Stepper
4. **Mock data + state** — Zustand store with User, Farm, Parcel, HarvestEntry, Listing, PricePoint
5. **Farmer vertical slice** — A0 entry, A2 Home dashboard, A3 Journal, A3-NEW harvest entry, A3-DETAIL
6. Buyer side gets shell + placeholder Discovery screen only (iterated later)

Out of scope for this plan: A1 OTP auth, onboarding flows (A1-ONB, B1-ONB), Price Intelligence (A4), Storefront (A5), Offers (A6), Community (A7), Analytics (A8/B7), Premium (A9/B9), Settings (A10), all Buyer screens beyond shell, Subscription (B8).

## Routes (TanStack Start, file-based)

```
src/routes/
  __root.tsx              — providers, head
  index.tsx               — A0 role picker (redirects if role set)
  _farmer.tsx             — farmer layout (sidebar desktop / bottom tabs mobile)
  _farmer.home.tsx        — A2 Home dashboard
  _farmer.journal.tsx     — A3 Journal list
  _farmer.journal.new.tsx — A3-NEW harvest entry form
  _farmer.journal.$entryId.tsx — A3-DETAIL
  _farmer.prices.tsx      — A4 stub
  _farmer.storefront.tsx  — A5 stub
  _farmer.analytics.tsx   — A8 stub
  _farmer.community.tsx   — A7 stub
  _buyer.tsx              — buyer layout
  _buyer.discover.tsx     — B1 placeholder
  _buyer.orders.tsx       — stub
  _buyer.reports.tsx      — stub
  _buyer.messages.tsx     — stub
  _buyer.account.tsx      — stub
```

Role guard reads from Zustand; if `user.role` unset → redirect to `/`. Dev role-switcher pinned bottom-left in dev mode.

## Design tokens (src/styles.css)

```css
@theme {
  --color-saffron: #C8833B;
  --color-sage:    #6B8F5E;
  --color-cream:   #F7F2E8;
  --color-dark:    #1A1A14;
  --color-muted-hasat: #8A8678;
  --color-gold:    #D4A843;
  --color-lav:     #8B9BF0;
  --color-bg-hasat:#F0EBE0;
  --color-red-hasat:#C0392B;
  --color-white-hasat:#FDFAF5;
  --font-serif: Georgia, serif;
  --font-mono:  "Courier New", monospace;
}
```

Map onto shadcn tokens (`--primary` = saffron, `--background` = bg-hasat, `--card` = cream, `--destructive` = red, `--foreground` = dark). Override in `:root` so shadcn components inherit the palette automatically.

## Shared components (`src/components/hasat/`)

- `TrustBadge` — props: `type: 'organik'|'iso'|'cografi'|'hasat'|'premium'|'yeni'`. Color + icon map per spec.
- `PriceTicker` — icon, name, price (mono), delta % (sage/red arrow).
- `OrderTimeline` — vertical stepper with done/active/pending states.
- `HarvestEntryCard`, `ProducerCard` — list cards.
- `Stepper` — `–`/`+` with integrated unit toggle.
- `BottomSheet` — wraps shadcn `Sheet` side="bottom" with handle bar, max 85vh.
- `AIInsightBanner` — 🤖 + text + optional CTA.
- `SeasonBanner`, `FarmPill`.
- `Sparkline`, `BarChart`, `LineChart` — thin wrappers on Recharts.
- `formatTRY(n)` util — `₺1.150.000` via `Intl.NumberFormat('tr-TR')`.

## State (Zustand, `src/lib/store.ts`)

Single store with `user`, `farms`, `parcels`, `harvestEntries`, `listings`, `offers`, `pricePoints` seeded with realistic Turkish mock data (saffron farmer in Karabük, sample entries for 2027/2028/2029, mock price history). Actions: `setRole`, `addParcel`, `addHarvestEntry`, `deleteHarvestEntry`. Persisted to localStorage.

## Vertical slice details

**A0 Entry** — full-screen dark, 🌸 Hasat logo + هارست subtitle, two CTA cards ("Çiftçiyim" / "Alıcıyım") routing to `/farmer/home` or `/buyer/discover`.

**Farmer layout** — desktop: 230px dark sidebar (brand, farm pill, season banner, nav, profile footer). Mobile: bottom tab bar (5 items) + top header. CSS grid switches at 768px.

**A2 Home** — dark header (greeting, farm pill, bell, season banner) + scrollable body: quick-action chips, revenue card (dark, gold mono ₺340.000, sparkline), active listings card, activity feed, weather widget (mocked), AI yield anomaly card, AI insight banner.

**A3 Journal** — year tabs (2027/2028/2029), summary stats, parcel cards, FAB "+ Yeni Kayıt", empty state, "+ Yeni Parsel" bottom sheet with GPS simulation (1.5s spinner → "Karabük, Safranbolu ✓").

**A3-NEW** — full form: parsel + date grid, auto-detected crop banner, qty stepper with g/kg toggle, A/B/C quality grid, GPS badge, 3 photo slots, notes, expandable input costs accordion with running total, "Kaydet ✓" → full-screen sage success → auto nav back after 2s.

**A3-DETAIL** — KPI 2×2 grid, yield bar chart, P&L card, AI insight, storefront shortcut, ⋯ menu with destructive delete confirm.

## Technical notes

- TanStack Start file-based routing, TanStack Query for any future async, Zustand for client state.
- shadcn components: Sheet, Tabs, Select, Slider, Switch, Badge, Dialog, Accordion, Button — restyled via tokens, not custom rewrites.
- Recharts for charts (line, bar, sparkline). Donut deferred to B7.
- Turkish strings inline (no i18n framework needed for prototype).
- Mobile breakpoint: `md:` (768px) for sidebar swap.
- All routes get `head()` with Turkish titles.

## After this slice

Follow-up prompts will add: auth/onboarding, prices, storefront, offers/counter-offers, community, analytics, premium/billing, settings, and the full Buyer side (discovery cards, producer profile, make offer, payment, order tracker, subscriptions, reports).
