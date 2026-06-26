## Phase 15 — Offer/Negotiation/Order Flow

End-to-end rebuild of the offer state machine, ping-pong negotiation, simulated payment, and aligned Turkish labels across farmer + buyer sides.

---

### 1. Database (single migration, additive only)

**`offers` table** — add columns via `ADD COLUMN IF NOT EXISTS`:
- `ball_side text DEFAULT 'farmer'` + CHECK `('farmer','buyer')`
- `current_price numeric` (backfilled from `price_per_unit`)
- `current_quantity numeric` (backfilled from `quantity`)
- `payment_status text DEFAULT 'unpaid'` + CHECK `('unpaid','pending','paid')`

**`offer_status` enum** — extend with `ALTER TYPE ... ADD VALUE IF NOT EXISTS`:
- `pending_farmer`, `negotiating`, `pending_payment`, `active`, `delivered`

Keep existing values (`pending`, `accepted`, `counter`, `completed`, `rejected`) for back-compat. New writes use the new values; mapper treats legacy `pending`→`pending_farmer`, `counter`→`negotiating`, `accepted`→`pending_payment` when read.

**New table `offer_messages`** (negotiation thread):
- `offer_id uuid → offers`, `sender_role text CHECK ('farmer','buyer')`, `sender_id uuid → auth.users`, `price numeric`, `quantity numeric`, `note text`, `created_at`
- GRANTs to authenticated + service_role
- RLS: SELECT allowed for the offer's buyer_id or farmer_id; INSERT requires `sender_id = auth.uid()` AND sender_role matches caller's relation to the offer

**Notification triggers** — update existing `notify_offer_received` / `notify_offer_accepted` to emit the new contextual titles & bodies (buyer name, product, price). Add trigger for `payment_status` flipping to `paid` → notify farmer.

---

### 2. Data layer (`src/lib/hasat/queries.ts` + `types.ts`)

- Extend `OfferStatus` union and add `ballSide`, `currentPrice`, `currentQuantity`, `paymentStatus`, `messages[]` to `Offer`.
- `dbToOffer` reads new columns, falls back to legacy values.
- New hooks:
  - `useOfferMessages(offerId)` — list + realtime channel
  - `useSendCounterOffer({ offerId, price, quantity, note })` — inserts `offer_messages` row, updates offer (`status=negotiating`, `ball_side`=other side, `current_price/quantity`)
  - `useAcceptOffer(offerId)` — guards `ball_side === myRole`; sets `status=pending_payment`, `ball_side='buyer'`
  - `useRejectOffer(offerId, reason?)` — sets `status=rejected`
  - `useWithdrawCounter(offerId)` — only the last sender can call; reverts ball_side or cancels last message
  - `useSimulatePayment(offerId)` — buyer only; sets `payment_status='paid'`, `status='active'`; creates `orders` row if not present

All mutations invalidate `["offers", role, userId]` and `["offer-messages", offerId]`.

---

### 3. Farmer UI — `src/routes/farmer.orders.index.tsx`

Rewrite `OfferCard` (in `Gelen` tab):
- Header: buyer display name + type chip, time-ago
- Body: product (formatted), qty × unit, total ₺X (₺Y/unit) from `currentPrice/currentQuantity`
- Negotiation thread: render `offer_messages` chronologically with "Alıcı" / "Siz" labels and per-round price/qty
- Conditional actions:
  - `ball_side === 'farmer'` → **Kabul Et** (modal), **Karşı Teklif** (modal form), **Reddet** (modal w/ optional reason)
  - `ball_side === 'buyer'` → info banner "Karşı teklifiniz iletildi, alıcı yanıtı bekleniyor." + **Geri Çek** button
- `pending_payment` cards render in Gelen with amber "Ödeme Bekleniyor" badge, no action buttons

`Aktif` tab: orders with `payment_status='paid'` → "✅ Ödeme Alındı" badge, buyer phone revealed, "Teslim Edildi" button → `status=delivered`.

`Tamamlanan` tab: delivered/completed/rejected (read-only).

Replace existing `farmer.orders.$offerId.counter.tsx` modal/route with an in-place modal on the card (simpler).

Status label helper (Turkish) used everywhere:
```
pending_farmer → "Yanıt Bekleniyor"
negotiating + farmer-turn → "Karşı Teklifinizi Gönderin"
negotiating + buyer-turn → "Alıcı Yanıtı Bekleniyor"
pending_payment → "Ödeme Bekleniyor"
active → "Aktif"
delivered → "Teslim Edildi"
completed → "Tamamlandı"
rejected → "Reddedildi"
```

---

### 4. Buyer UI

**`src/routes/buyer.orders.tsx`** (Tekliflerim tab):
- Mirror conditional buttons based on `ball_side === 'buyer'`
- When `status=pending_payment`, show **Ödemeyi Tamamla** CTA → routes to `buyer.payment` with offerId
- When `status=negotiating` + farmer-turn → "Yanıtınız iletildi, çiftçi yanıtı bekleniyor."
- Show full negotiation thread (reuse component)

**`src/routes/buyer.negotiation.$offerId.tsx`** — keep but rewire to use `useSendCounterOffer`.

**`src/routes/buyer.payment.tsx`** — simulated payment screen: order summary + **Ödemeyi Tamamla** → `useSimulatePayment` → success toast → redirect to Aktif tab.

---

### 5. Shared component

**`src/components/hasat/NegotiationThread.tsx`** (new, replaces inline `NegotiationTimeline` usage for new data) — reads `offer_messages`, labels "Alıcı"/"Çiftçi"/"Siz" based on viewer, highlights latest round.

---

### 6. Sidebar / route cleanup

- `src/routes/farmer.tsx` sidebar already targets `/farmer/orders` ✓
- Delete `src/routes/farmer.offers.tsx` (placeholder) and remove from route tree by deleting the file; the `Teklifler` link already points to `/farmer/orders`.
- Delete `src/routes/farmer.orders.$offerId.counter.tsx` (replaced by inline modal).

---

### 7. Notifications copy

Update trigger bodies to match spec:
- New offer → farmer: `🌾 {buyer} {crop} için {qty}{unit} - ₺{total} teklif gönderdi`
- Counter → buyer: `↩️ {farmer} teklifinize karşı teklif yaptı: {qty}{unit} @ ₺{price}/{unit}`
- Accepted → buyer: `✅ {farmer} teklifinizi kabul etti! Ödeme yaparak siparişi tamamlayın.`
- Payment paid → farmer: `💰 {buyer} ödemeyi tamamladı. Sipariş aktif.`
- Rejected → buyer: `❌ {farmer} teklifinizi reddetti.`

---

### Verification checklist

1. Buyer sends offer → farmer Gelen shows buyer/product/price + 3 buttons
2. Farmer counter → buttons swap to "bekleniyor" banner + Geri Çek; buyer notified
3. Farmer cannot Accept when `ball_side='buyer'` (button hidden + server guard)
4. Farmer Kabul Et → Gelen shows "Ödeme Bekleniyor", not yet in Aktif
5. Buyer Ödemeyi Tamamla → moves to Aktif with "Ödeme Alındı" badge, order row created
6. Sidebar Teklifler → /farmer/orders
7. All status text in Turkish, no English visible

### Technical notes

- Extending enum values is non-destructive; legacy rows keep working via mapper fallback.
- Ping-pong rule enforced both client-side (button visibility) and server-side (mutation checks `ball_side` before update).
- Realtime subscription on `offer_messages` keeps both parties in sync without polling.
- No real payment integration — `buyer.payment.tsx` simulates with a single button.
