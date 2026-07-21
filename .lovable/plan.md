Plan

- Only file affected: `src/routes/buyer.producer.$id.tsx`.
- Action: relocate the existing "Hasat Aboneliği" subscription card (the gold-bordered card containing the subscription stats and CTA button) so it appears immediately after the "Genellikle 24 saat içinde yanıtlar" response badge and before the "Verim Geçmişi" section.
- New order on the page: hero → stat cards → response badge → Hasat Aboneliği kartı → Verim Geçmişi → Aktif Ürünler → Tarlalarım → Değerlendirmeler.
- No logic/content changes: keep all current state, variables, and the existing `subscription`/`nextHarvestLabel`/`estimatedQtyLabel`/`navigate` wiring intact.
- Verify: `tsgo` typecheck after the JSX move.