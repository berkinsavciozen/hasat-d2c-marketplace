-- offers.updated_at was never bumped by any trigger (confirmed via pg_trigger inspection —
-- 7 triggers exist on public.offers, none touch updated_at). Found independently while verifying
-- ChatGPT/Codex's C0 report (Lansman Planı v2 §26). Low-risk, additive fix: reuse the existing
-- public.set_updated_at() trigger function already used elsewhere in this schema (e.g.
-- crop_nutrition, recipes) rather than inventing a new one.
create trigger trg_offers_updated_at
  before update on public.offers
  for each row execute function public.set_updated_at();
