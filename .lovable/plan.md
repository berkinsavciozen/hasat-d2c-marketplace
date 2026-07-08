
# Landing page contrast fixes

Scope: `src/routes/index.tsx` only. No other routes, no global tokens.

## Problems found (audit of every section)

1. **`--lp-gray` (#8A8F87) on cream is too light.** Used everywhere for body copy, captions, meta, footer, form labels. Contrast against `--lp-cream` (#F5F1E6) ≈ 2.9:1 — fails WCAG AA for small text. This is the single biggest issue and affects value pillars, marketplace cards, personas, map side card, footer, form field labels, etc.

2. **Hero bottom gradient fades to cream while text stays white.** The gradient ends at `color-mix(var(--lp-cream) 92%)`, so the paragraph and CTA row can sit on a near-cream background with white/`white/85` text → unreadable on shorter viewports. Also the "Türkiye'nin izlenebilir tarım pazarı" pill uses `#EAF1EA` on translucent white, borderline on light patches.

3. **AI ChatCard "Hasat" bubble** uses `--lp-cream` background inside a `--lp-cream-2` section — bubble nearly disappears; only the 1px line separates it. Farmer bubble is fine.

4. **Supply-chain traditional nodes fade with `opacity: 1 - i*0.08`** — last nodes drop to ~0.6 opacity on already-low-contrast earth tint. Text becomes hard to read.

5. **TrustScoreLadder tier cards**: cream cards on cream-2 section, "Aşama N" label in `--lp-gray` — same gray issue; description text also `--lp-gray`.

6. **TurkeyMap side card**: region name is fine but `pin.crop · pin.qty` and pill row in `--lp-gray` fail the same way.

7. **Indoor form**: field labels + "İlgi tipi" caption in `--lp-gray` on cream — same problem.

## Fix strategy

**A. Introduce two darker text tokens (still scoped, added to `lpVars`):**
- `--lp-muted: #5A6560` — replaces `--lp-gray` for all body/meta text on cream surfaces. Contrast ≈ 6.5:1 on cream, still visibly secondary vs. `--lp-ink`.
- Keep `--lp-gray` only where it's decorative (progress bar gradient stop, disabled pin dot).

Do a mechanical swap of `color: "var(--lp-gray)"` → `color: "var(--lp-muted)"` in text usages. Keep the gradient in TrustScoreLadder and the inactive map pin fill as `--lp-gray`.

**B. Hero:**
- Change the overlay gradient bottom stop from cream to keep the dark tint under the content: end at `color-mix(var(--lp-primary) 35%, transparent)` instead of fading to cream. The section boundary already gives visual separation via the next section's own background.
- Change the eyebrow pill text from `#EAF1EA` → `#FFFFFF` and lift bg opacity to `rgba(255,255,255,0.18)`.

**C. AI ChatCard Hasat bubble:**
- Change bg from `--lp-cream` to `--lp-white` so it separates from the `--lp-cream-2` section. Keeps ink text, keeps the border.

**D. Supply chain traditional nodes:**
- Drop the `opacity: 1 - i*0.08` and the shrinking `18 - i*2%` tint. Use a single readable tint (`color-mix(var(--lp-earth) 14%, var(--lp-white))`) with full opacity, keep the arrow+"değer" caption using `--lp-earth` at 0.85 opacity to still convey the "value bleeds away" idea via the caption row rather than fading the labels themselves.

**E. TrustScoreLadder + TurkeyMap side card + Indoor form labels:**
- Covered by the `--lp-muted` swap in (A). No structural changes.

**F. Footer:**
- Change base footer text color from `--lp-gray` to `--lp-muted`. Underlined links inherit — legible.

## Non-goals

- Not touching global tokens, other routes, layout, copy, imagery, animations, or the design language. Purely legibility.
- Not touching the Indoor (`--lp-primary` bg) section — white/white-85 on deep green is already fine.

## Verification

- Re-read the file after edits and confirm no stale `--lp-gray` remains in `color:` contexts (only in the two decorative spots).
- `tsgo` typecheck.
- Spot-check the preview at `/` for the hero bottom, AI section, supply chain, and footer.
