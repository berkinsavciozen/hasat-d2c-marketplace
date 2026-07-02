
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS iban text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bank_account_name text;

ALTER TABLE public.offers DROP CONSTRAINT IF EXISTS offers_payment_status_check;
ALTER TABLE public.offers ADD CONSTRAINT offers_payment_status_check
  CHECK (payment_status IN ('unpaid','pending','pending_transfer','paid'));
