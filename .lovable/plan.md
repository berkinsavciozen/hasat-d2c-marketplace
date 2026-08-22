# Hasat Web — Read-Only UI Audit (no code changes)

Static audit of every user-facing route against the approved direction: deep blue / blue-teal primary, amber only for discovery + editorial, green only for verification/success, Inter UI, controlled Manrope buyer headings, 12px button radius, warm neutral backgrounds, 4:3 buyer product imagery.

## System-level findings (apply to nearly every route)

1. **No primary blue exists.** `src/styles.css:52-81` maps `--primary`, `--ring`, `--accent` to saffron `#C8833B` and gold `#D4A843`. Amber is currently the *global* primary (CTAs, active nav, focus rings), not a discovery/editorial accent. This is the single largest deviation.
2. **Green is overloaded.** `--sage #6B8F5E` is used for success *and* for neutral data states (stock counts, chart bars, accept buttons, price-lock toggles) — e.g. `batch.$listingId.tsx:83`, `buyer.reports.tsx`, `farmer.orders.index.tsx`.
3. **No Inter, no Manrope loaded.** `__root.tsx` has no font `<link>`; body is the system sans stack (`styles.css:91`) and headings are Georgia serif (`--font-serif`, used 142×). Buyer headings are serif everywhere via `BuyerHeader.tsx:8`.
4. **Four competing radius systems.** 773 `rounded-*` usages: `rounded-full` 220, `rounded-lg` 152, `rounded-2xl` 143, `rounded-xl` 136, `rounded-md` 60. shadcn `button.tsx:8` = `rounded-md`; hand-built CTAs are pills; cards mix `xl`/`2xl`. Nothing consumes the `--radius` token. 12px = `rounded-xl` would be the target for buttons.
5. **Token bypass.** Colors are applied through inline `style={{ background: "var(--dark)" }}` in most routes instead of Tailwind classes; 146 raw hex literals, 75 `text-white`, hardcoded `#25D366` (WhatsApp) at `buyer.orders.$orderId.tsx:190`, `farmer.home.tsx:46`, `farmer.referral.tsx:66`, and `#16a34a/#d97706/#dc2626` at `farmer.settings.tsx:381`.
6. **Landing page is a second brand.** `index.tsx:116-128` defines a private `--lp-*` palette (deep green/navy) unrelated to the app palette — ironically closer to the approved direction than the app is.
7. **No 4:3 imagery anywhere.** All product photos use fixed heights + `object-cover` (`h-28`, `h-40 md:h-52`, `h-48`, `h-52`), so ratio drifts by breakpoint. `RepresentativePhoto` delegates ratio to callers.
8. **Warm neutral backgrounds already exist** (`--background #F0EBE0`, `--card #F7F2E8`) — this part of the direction is met.

## Buyer surface

| Route / file | Purpose & sections | Responsive (from code) | Key inconsistencies | Style-only recommendation | Files touched | 320–430 risk | Mobile-app item |
|---|---|---|---|---|---|---|---|
| `buyer.tsx` shell | Sidebar 230px + 5-tab bottom nav + More sheet | `md:grid-cols-[230px_1fr]`, `md:hidden` nav, `pb-safe` | Active tab `bg-saffron` = amber as primary | Active nav → blue-teal; keep amber for Keşfet icon only | `buyer.tsx:65,77,86` | 5 cols × 10px Turkish labels | Yes |
| `buyer.discover.tsx` | Search, filter/sort chips, "Senin İçin" rail, categories, listing grid | `grid-cols-2 md:grid-cols-4`, `overflow-x-auto` rails | Amber search/CTA/sort-active; card photos `h-28`; serif titles | Amber legitimately fits discovery — keep; move CTA to blue; photos → `aspect-[4/3]`; Manrope headings | `buyer.discover.tsx:127-347` | OK | Yes (ratio + heading) |
| `buyer.product.$farmerId.$crop.tsx` | Hero, batch rows, delivery, sticky total bar | Fixed bottom bar `:209`, hero `h-40 md:h-52` | Amber CTA; no `pb-safe` on the fixed bar | Hero → `aspect-[4/3] md:aspect-[16/9]`; CTA blue; add safe-area padding | same file | Batch qty row crowds | Yes |
| `buyer.producer.$id.tsx` | Hero, stats, subscription card, chart, products, parcels, reviews | `grid-cols-3` stats **no prefix** `:121` | Gold subscription card; product `h-40` | Stats `grid-cols-1 sm:grid-cols-3`; verification badges → green, rest neutral/blue | `:121,208,217,256` | **High** — 3 cols at 320 | Yes |
| `buyer.offer.$listingId.tsx` | Hero, provenance, stepper, price, delivery, notes | Single col `max-w-2xl` | Sage used for the total banner (not a success state) | Total banner → neutral/blue tint; green reserved for verified | same | Low | Yes |
| `buyer.negotiation.$offerId.tsx` | Timeline, diff banner, sticky 3-action bar, counter sheet | `grid-cols-3` bar with `sm:` label hiding `:110`; counter sheet `grid-cols-3` `:190` | Amber accept CTA | Counter sheet → `grid-cols-1 sm:grid-cols-3` | `:190` | **High** — long delivery labels | Yes |
| `buyer.orders.tsx` | 3 tabs: offers / active / completed | `TabsList grid-cols-3` with counts `:201` | Amber+gold status chips compete with green | Tab labels `text-[11px] truncate`; unify status chip palette | `:201,130,265` | Medium — counts in labels | Yes |
| `buyer.orders.$orderId.tsx` | Summary, timeline, review, reorder, dispute, WhatsApp | `sm:grid-cols-2` CTA pairs | Hardcoded `#25D366` | Tokenize WhatsApp green as `--whatsapp` | `:190` | Low | Yes |
| `buyer.pay.$offerId` / `buyer.payment` | IBAN transfer / card tabs / success | `grid-cols-2` tabs, truncated IBAN | Sage success screen — correct use of green | Keep; move CTA to blue | both | Low | No |
| `buyer.messages.tsx` | Offer-thread inbox | Single-column list | No serif heading; cream cards differ from other lists | Align card surface + heading with Orders | `:76` | Low | Yes |
| `buyer.subscriptions` / `.subscription.$producerId` | Subscription cards, fulfillment bar, create flow | `grid-cols-2` stats — safe | Lav for pending, gold for locked price, sage for progress | Progress → blue-teal; keep green only for "fulfilled" | both | Low | Yes |
| `buyer.requests.tsx` | Crop request list w/ status | `grid-cols-2` detail | Amber = "open", gold = "matched" (near-identical hues) | Open → blue, matched → green | `:73` | Low | Yes |
| `buyer.reports.tsx` | KPIs, 6-mo chart, crop bars, supplier trust, CSV | `grid-cols-2 md:grid-cols-4`, `sm:grid-cols-2` | Gold KPI + amber bars; green/gold/red on-time logic | Chart series → blue-teal ramp; green only for on-time pass | `:149,202,234` | Low | Yes |
| `buyer.account.tsx` | Profile, settings links, addresses, interests, danger zone | Single col `max-w-2xl` | Gold avatar/premium badge | Premium → gold (editorial, OK); logout/delete stay red | — | Low | No |
| `buyer.prices.*`, `buyer.community`, `buyer.settings.notifs` | Delegate to `PricesPageBody`, `CommunityFeed`, dual-layout matrix | notifs has explicit mobile/desktop split — best-in-repo | Chart colors via `--gold/--sage/--hred` | Recolor chart palette in the shared components | `PricesPageBody.tsx`, `CommunityFeed.tsx` | CommunityFeed FAB `bottom-24` vs tab bar | Yes |
| `batch.$listingId.tsx` | Photos, stock stats, provenance / harvest mgmt | `grid-cols-3` stock **no prefix** `:83`; snap carousel | Green/red used for stock quantities, not status | Stats responsive; stock numbers neutral | `:59-83` | **High** | Yes |

## Farmer surface

| Route / file | Purpose | Responsive | Inconsistencies | Recommendation | Risk 320–430 | Mobile item |
|---|---|---|---|---|---|---|
| `farmer.tsx` shell + `FarmerHeader` | Sidebar, 5-tab nav, More sheet, AI FAB | `pb-safe`, `pb-24 md:pb-0` | `bg-saffron` active, gold premium CTA, mono micro-labels | Active → blue-teal; keep gold for premium | 5 cols tight | Yes |
| `farmer.home.tsx` | Chat bar, pending banner, AI box, quick actions, revenue | `overflow-x-auto` bleed rail (good pattern) | `#25D366` hardcoded | Tokenize; CTA → blue | Low | Yes |
| `farmer.journal.index/new/$entryId/customize` | Entries, month headers, chip rows, KPI grid, freq sheet | Consistent bleed rails; FAB `bottom-20 md:bottom-8` | Hash-palette chips vs brand palette; `grid-cols-5` health; KPI stuck at 2 cols | Constrain chip palette to a blue-teal ramp; KPI `md:grid-cols-4` | Long freq labels in `grid-cols-2` | Yes |
| `farmer.orders.index.tsx` | Offer/order tabs, negotiation, dialogs | `grid-cols-1 sm:grid-cols-3` actions (good) | **No serif headings at all** — diverges from other routes | Add heading scale; unify status chips | Low | Yes |
| `farmer.storefront.tsx` | Vitrin preview, tabs, listings, parcel galleries, sheet form | snap carousels, FAB `bottom-36` | Widest radius mix (`md/lg/2xl/full`); `h-28 w-40` photos | Radius unification; photos → `aspect-[4/3]` | Chip row wraps | Yes |
| `farmer.subscriptions.tsx` | Pending/active/closed, schedule form | `sm:grid-cols-[1fr_1fr_auto]` (good) | Only route using `--lav` | Fold lav into the blue-teal ramp | Low | Yes |
| `farmer.analytics.tsx` | Stats, revenue bars, crop breakdown | `grid-cols-2 md:grid-cols-4` | Amber+gold bars; no serif | Chart ramp → blue-teal | Low | Yes |
| `farmer.premium` / `.billing` / `.referral` | Plans, payment tabs, referral code | Stack on mobile | Gold/amber plan surfaces (acceptable editorial); `#25D366`; `font-mono text-5xl` code | Tokenize; add `break-all` to code | Referral code may overflow | No |
| `farmer.settings.tsx` | Farm info, parcels, certs, bank, AI usage, export, danger | Single col — inherently safe | Hardcoded `#16a34a/#d97706/#dc2626` `:381`; cert badges red/gold | AI bar → token ramp; **verified certs are the correct home for green** | Parcel rows lack `min-w-0` `:247-260` | Yes |
| `farmer.settings.notifs.tsx` | Prefs matrix | Explicit mobile cards + desktop table | Clean | Reference pattern for other tables | None | Yes |
| `farmer.community.tsx`, `farmer.prices.*` | Delegate to shared components | — | Inherit shared palette issues | Fix at component level | — | Yes |

## Public / onboarding / P2

`index.tsx` (own `--lp-*` palette, 16 sections), `login.tsx` (6 OTP boxes `gap-1` — tight at 320), `join.tsx`, `onboarding.buyer/farmer.tsx` (`grid-cols-2` emoji tiles, inline `fontFamily: Georgia`), `tarifler.index/$slug.tsx` (**the legitimate home for amber/editorial**; photos `h-36`, `h-56 md:h-72` → should be 4:3/16:9), `s.$slug.tsx` (fixed bottom CTA bars without `pb-safe`, parcel photos `h-28`), `terms.tsx`/`privacy.tsx` (per-`h2` inline gold color repeated 10+×), `admin.kpi.tsx` (only route using shadcn tokens properly; Recharts `YAxis width={80}` squeezes at 320), `auth.mobile-handoff.tsx`, oauth consent.

## Priority grouping

- **P0 MVP:** buyer discover, product, offer, negotiation, orders (+detail), pay/payment, buyer shell; farmer home, journal (index/new), orders, storefront, farmer shell; login, onboarding ×2, landing.
- **P1 supporting:** buyer messages, subscriptions ×2, requests, reports, community, account, prices; farmer subscriptions, analytics, prices, settings (+notifs), community, journal detail/customize, referral, premium/billing; tarifler ×2, `s.$slug`, `batch.$listingId`, buyer notifs.
- **P2 / admin / legal:** `admin.kpi`, `terms`, `privacy`, `join`, `auth.mobile-handoff`, oauth consent, sitemap/mcp.

## Product / IA overlaps (observations only, not instructions)

- **Messages ⟷ Orders "Tekliflerim"** read the same `useBuyerOffers` data and both deep-link to `/buyer/negotiation/$offerId`; Messages is an inbox view, Orders is the actionable view of the identical records.
- **Subscriptions** is upstream (it *creates* offers) rather than duplicative, but its "Şimdi Sipariş Ver" produces records that then appear in Orders and Messages.
- **Requests** is separate data (no listing yet) but is a fifth status-tracking list; a buyer sees status lists in Messages, Orders ×3 tabs, Subscriptions, Requests, and Reports.

## Verification limits

All findings are static-code inferences (Tailwind classes, tokens, inline styles). No browser rendering was performed, so the 320/375/390/430 px risks marked "High" are unconfirmed visually. `PricesPageBody`, `CropDetailBody`, and `CommunityFeed` were reached only indirectly.
