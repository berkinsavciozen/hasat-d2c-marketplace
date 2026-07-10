# Server-side enforcement of 4 audit gaps

All four fixes are DB triggers only (plus one tiny UI copy touch for #4). No client TS logic is removed — client checks stay for UX. Single migration file with all four functions + triggers, so it's atomic.

Each trigger short-circuits when `auth.uid() IS NULL` (service-role / admin / migration paths), matching the existing `enforce_offer_accept_turn` pattern.

---

## 1. `enforce_offer_transitions()` — BEFORE UPDATE on `offers`

Additive to existing `enforce_offer_stock` + `enforce_offer_accept_turn`. Codifies the exact state machine from `src/lib/hasat/queries.ts`.

```sql
CREATE OR REPLACE FUNCTION public.enforce_offer_transitions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  econ_changed boolean;
BEGIN
  IF uid IS NULL THEN RETURN NEW; END IF;

  -- ── payment_status state machine ──────────────────────────────
  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
    IF OLD.payment_status = 'unpaid'
       AND NEW.payment_status = 'pending_transfer'
       AND uid = NEW.buyer_id
       AND OLD.status = 'accepted' THEN
      NULL; -- allowed: mark_transfer_sent
    ELSIF OLD.payment_status = 'pending_transfer'
       AND NEW.payment_status = 'paid'
       AND uid = NEW.farmer_id THEN
      NULL; -- allowed: confirm_payment_received
    ELSE
      RAISE EXCEPTION 'Geçersiz ödeme durumu geçişi: % -> %',
        OLD.payment_status, NEW.payment_status;
    END IF;
  END IF;

  -- ── economic fields (price/qty) ───────────────────────────────
  econ_changed :=
       NEW.price_per_unit    IS DISTINCT FROM OLD.price_per_unit
    OR NEW.quantity          IS DISTINCT FROM OLD.quantity
    OR NEW.current_price     IS DISTINCT FROM OLD.current_price
    OR NEW.current_quantity  IS DISTINCT FROM OLD.current_quantity;

  IF econ_changed THEN
    -- allowed only inside a counter transition by the party holding the ball
    IF NEW.status <> 'counter'
       OR OLD.status NOT IN ('pending','counter')
       OR uid <> CASE COALESCE(OLD.ball_side,'farmer')
                   WHEN 'farmer' THEN OLD.farmer_id
                   WHEN 'buyer'  THEN OLD.buyer_id END
       OR COALESCE(NEW.ball_side,'farmer') = COALESCE(OLD.ball_side,'farmer')
       OR NEW.ball_side NOT IN ('farmer','buyer') THEN
      RAISE EXCEPTION 'Fiyat/miktar yalnızca karşı teklif sırasında ve sıra sizdeyken değiştirilebilir';
    END IF;
  END IF;

  -- ── status transitions whitelist ──────────────────────────────
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
         (OLD.status = 'pending' AND NEW.status IN ('counter','accepted','rejected'))
      OR (OLD.status = 'counter' AND NEW.status IN ('counter','accepted','rejected'))
    ) THEN
      RAISE EXCEPTION 'Geçersiz teklif durum geçişi: % -> %', OLD.status, NEW.status;
    END IF;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER enforce_offer_transitions_trg
  BEFORE UPDATE ON public.offers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_offer_transitions();
```

Note: turn-taking on `accepted` is already covered by `enforce_offer_accept_turn`; we don't duplicate it. Stock check stays in `enforce_offer_stock`.

Verification: as buyer, raw `UPDATE offers SET payment_status='paid' WHERE id=…` → must raise `Geçersiz ödeme durumu geçişi: unpaid -> paid`.

---

## 2. `enforce_community_moderation()` — BEFORE INSERT OR UPDATE on `community_posts`

Mirrors `looksLikePriceCoordination()` exactly. Trigger is authoritative: always overwrites `flagged_for_review`.

```sql
CREATE OR REPLACE FUNCTION public.enforce_community_moderation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s text := ' ' || lower(coalesce(NEW.content,'')) || ' ';
  has_currency boolean;
  has_coord boolean;
BEGIN
  has_currency := s LIKE '%₺%' OR s LIKE '% tl%' OR s LIKE '%$%';
  has_coord := s LIKE '%anlaşalım%'
            OR s LIKE '%birlikte%'
            OR s LIKE '%hepimiz%'
            OR s LIKE '%sabit fiyat%'
            OR s LIKE '%taban fiyat%';
  NEW.flagged_for_review := (has_currency AND has_coord);
  RETURN NEW;
END $$;

CREATE TRIGGER enforce_community_moderation_trg
  BEFORE INSERT OR UPDATE ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_community_moderation();
```

Runs on every path (no `auth.uid()` skip) — moderation must apply even to admin inserts. Verification: raw `INSERT` with "hepimiz ₺50 taban fiyat" → `flagged_for_review = true`.

---

## 3. `enforce_profile_self_update_restrictions()` — BEFORE UPDATE on `profiles`

Silently reverts protected fields when the row owner tries to change them. `referred_by` allowed only on NULL→non-NULL transition.

```sql
CREATE OR REPLACE FUNCTION public.enforce_profile_self_update_restrictions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR uid <> NEW.id THEN RETURN NEW; END IF;

  -- Silently revert protected fields
  NEW.role       := OLD.role;
  NEW.tier       := OLD.tier;
  NEW.premium    := OLD.premium;
  NEW.buyer_type := OLD.buyer_type;

  -- referred_by: allow only NULL -> non-NULL (one-shot)
  IF NEW.referred_by IS DISTINCT FROM OLD.referred_by THEN
    IF OLD.referred_by IS NOT NULL THEN
      NEW.referred_by := OLD.referred_by; -- silently keep
    END IF;
    -- NULL -> non-NULL is allowed as-is
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER enforce_profile_self_update_restrictions_trg
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_self_update_restrictions();
```

Ordering: this trigger fires before `profiles_sync_tier_premium`. Since we revert `tier`+`premium` to OLD together, the sync trigger sees no change and is a no-op — safe. Verification: buyer runs `UPDATE profiles SET role='farmer' WHERE id=auth.uid()` → row unchanged.

---

## 4. `enforce_cert_verification()` — BEFORE INSERT OR UPDATE on `certifications`

```sql
CREATE OR REPLACE FUNCTION public.enforce_cert_verification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RETURN NEW; END IF;
  IF uid = NEW.farmer_id THEN
    NEW.verified_at := NULL;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER enforce_cert_verification_trg
  BEFORE INSERT OR UPDATE ON public.certifications
  FOR EACH ROW EXECUTE FUNCTION public.enforce_cert_verification();
```

### UI copy touch (finding from audit)
`src/routes/farmer.settings.tsx:374` renders `Doğrulandı: {fmtDate(c.verified_at)}` — with the trigger in place this will always show empty for farmer-created rows. Change to conditional:
- if `c.verified_at`: `Doğrulandı: {fmtDate(c.verified_at)}`
- else: `Doğrulama bekleniyor`

`src/routes/s.$slug.tsx` reads `verified_at` but doesn't render "Doğrulandı" text, so nothing to change there.

---

## Delivery

1. One migration file with all 4 `CREATE OR REPLACE FUNCTION` + `CREATE TRIGGER` blocks (drop-if-exists on triggers so re-runs are safe).
2. Small edit to `farmer.settings.tsx` line 374 for the "Doğrulama bekleniyor" fallback.
3. Live verification of #1 (raw payment_status jump) and #2 (raw coordination insert) via `supabase--read_query`/`supabase--insert`.
4. `tsgo` at the end.

No changes to `src/lib/hasat/queries.ts` (client checks remain as UX/defense-in-depth).
