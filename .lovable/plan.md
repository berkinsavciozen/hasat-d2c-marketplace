# Referral Reward Mechanism

## Verified current state
- `profiles.referred_by` is set by `applyStoredReferral` in `queries.ts`; nothing consumes it.
- Tier is enforced in two places: **server** via `can_send_ai_message(_user_id)` RPC (source of truth for AI quota) and **client** via `fetchTier()` in `useAIChat.ts` (drives usage-meter UI). Display-only reads in `farmer.settings.tsx` (TierBadge). No other gates exist (confirmed by prior audit).
- Existing offer triggers on paid transition: `record_order_price_history` (SECURITY DEFINER, updates profiles-adjacent tables) and `enforce_offer_transitions`. Both left untouched — new trigger added additively.
- `enforce_profile_self_update_restrictions` only enforces when `auth.uid() = NEW.id`; a SECURITY DEFINER trigger running in the offer-update context has `auth.uid()` = the paying buyer, not the referrer, so writes to the referrer's profile pass through cleanly. This matches the pattern `record_order_price_history` already relies on.

## 1. Migration

```sql
-- Column
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS premium_until timestamptz;

-- Table
CREATE TABLE public.referral_qualifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referred_user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  referrer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  qualified_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.referral_qualifications TO authenticated;
GRANT ALL ON public.referral_qualifications TO service_role;
ALTER TABLE public.referral_qualifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Referrer can see own qualifications"
  ON public.referral_qualifications FOR SELECT TO authenticated
  USING (auth.uid() = referrer_id);
CREATE INDEX ON public.referral_qualifications(referrer_id);

-- Trigger function
CREATE OR REPLACE FUNCTION public.process_referral_qualification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  candidate uuid;
  ref_by uuid;
  inserted boolean;
  q_count int;
BEGIN
  IF NEW.payment_status <> 'paid' OR OLD.payment_status IS NOT DISTINCT FROM 'paid' THEN
    RETURN NEW;
  END IF;

  FOREACH candidate IN ARRAY ARRAY[NEW.buyer_id, NEW.farmer_id] LOOP
    SELECT referred_by INTO ref_by FROM public.profiles WHERE id = candidate;
    IF ref_by IS NULL OR ref_by = candidate THEN CONTINUE; END IF;

    WITH ins AS (
      INSERT INTO public.referral_qualifications (referred_user_id, referrer_id)
      VALUES (candidate, ref_by)
      ON CONFLICT (referred_user_id) DO NOTHING
      RETURNING referrer_id
    )
    SELECT true INTO inserted FROM ins;

    IF COALESCE(inserted, false) THEN
      SELECT count(*) INTO q_count
        FROM public.referral_qualifications WHERE referrer_id = ref_by;
      IF q_count > 0 AND q_count % 3 = 0 THEN
        UPDATE public.profiles
           SET premium_until = GREATEST(COALESCE(premium_until, now()), now()) + interval '12 months',
               tier = 'premium'
         WHERE id = ref_by;
      END IF;
    END IF;
    inserted := NULL;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_offers_referral_qualification
  AFTER UPDATE OF payment_status ON public.offers
  FOR EACH ROW EXECUTE FUNCTION public.process_referral_qualification();
```

Also update `can_send_ai_message` so premium expiry is honored server-side:

```sql
CREATE OR REPLACE FUNCTION public.can_send_ai_message(_user_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _tier public.user_tier; _pu timestamptz; _count int;
  _month text := to_char(now(), 'YYYY-MM'); _free_limit constant int := 50;
BEGIN
  IF current_setting('request.jwt.claims', true)::jsonb->>'role' = 'authenticated'
     AND _user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Cross-user access not allowed';
  END IF;
  SELECT tier, premium_until INTO _tier, _pu FROM public.profiles WHERE id = _user_id;
  IF _tier IS NULL THEN RETURN false; END IF;
  IF _tier = 'premium' AND (_pu IS NULL OR _pu > now()) THEN RETURN true; END IF;
  SELECT COALESCE(message_count,0) INTO _count FROM public.ai_usage_tracking
    WHERE user_id = _user_id AND month = _month;
  RETURN COALESCE(_count,0) < _free_limit;
END; $$;
```

## 2. Client tier expiry check
- `queries.ts` `useProfile` select: add `premium_until`.
- `useAIChat.ts` `fetchTier()`: also select `premium_until`; return `'free'` when `tier='premium' && premium_until && premium_until < now()`.
- `farmer.settings.tsx` `isPremium`: compute using same rule (helper `isEffectivelyPremium(profile)` in `queries.ts`).

## 3. UI progress on `farmer.referral.tsx`
Add a small card between the code card and the "Davet Ettiğin Çiftçiler" list:
- New hook `useReferralQualifications()` → count of rows where `referrer_id = auth.uid()`.
- Line: `"{count}/3 arkadaşın gerçek sipariş tamamladı — sonraki ödülüne {3 - count%3} kaldı"` with a 3-dot progress bar (mod 3). When a milestone was hit (premium_until in future), show "🎉 12 ay Premium kazandın — {formatDate(premium_until)} tarihine kadar geçerli".

## 4. Verification
- Create two disposable profiles B1, B2, B3 with `referred_by = R` (test referrer, existing test farmer). Create/borrow a disposable listing + insert 3 offers (buyer_id = B1/B2/B3) with `payment_status='unpaid'`, then update each to `'paid'`. Confirm 3 `referral_qualifications` rows and `profiles.premium_until` for R = ~now()+12mo, tier='premium'. Delete all test rows and revert R.
- Also verify a 2nd paid offer from the same buyer does NOT create a duplicate qualification (ON CONFLICT).
- `tsgo --noEmit`.

## Files touched
- migration (new)
- `src/lib/hasat/queries.ts` (profile select + `useReferralQualifications`, `isEffectivelyPremium`)
- `src/components/hasat/ai-chat/useAIChat.ts` (`fetchTier` expiry)
- `src/routes/farmer.settings.tsx` (use helper)
- `src/routes/farmer.referral.tsx` (progress card)
