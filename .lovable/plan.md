## SupplyChain redesign — dual chain + motion

Scope: `src/routes/index.tsx`, only the `SupplyChain` component and a small block of CSS keyframes appended to `LandingStyles`. No new dependencies.

### Layout changes

- Remove `mode` state, the toggle, and `isHasat` branching entirely.
- Replace the single card with two stacked mini‑cards inside one wrapper (`grid gap-6 md:grid-cols-1`) — traditional on top, Hasat below — so the eye reads "6 leaks → 1 clean pipe" top‑to‑bottom on both desktop and mobile. (Side‑by‑side compresses the 6‑node chain too much on desktop; stacking keeps each chain at readable width. Both chains are always visible without any click, satisfying the "no toggle" requirement.)
- Each mini‑card keeps: small eyebrow label ("Geleneksel" / "Hasat ile"), the node/bar row, and its existing caption underneath.
- Traditional card border/accent tinted `--lp-earth`; Hasat card border/accent tinted `--lp-primary` — matching the two headline callout cards above.

### Chain rendering

- Traditional: 6 nodes (Çiftçi 100 → Aracı 62 → Toptancı 46 → Distribütör 32 → Perakendeci 22 → Tüketici 14). Keep the current node pill + vertical bar + `%` label layout.
- Hasat: 2 nodes (Çiftçi 100 → Alıcı 95). Because 2 nodes look sparse in a 6‑column grid, render the Hasat chain in its own 2‑column grid at the same max width so the two nodes sit at the far ends of the card — the wide empty middle becomes the "direct pipe" canvas for the flow animation.

### Connector layer (SVG overlay per card)

Each mini‑card gets an absolutely‑positioned SVG spanning the node row (`position: absolute; inset: 0; pointer-events: none`). The SVG draws the connector line(s) between node centers and hosts the animated particles. Node column widths are equal, so particle x‑positions are computed as percentages of the SVG viewBox — no JS measurement needed, no `requestAnimationFrame`.

**Traditional — "value being eaten away":**
- A single horizontal guide line at bar‑top height, dashed, `--lp-earth` at 40% opacity.
- 5 `<circle>` particles, one per segment (Çiftçi→Aracı, Aracı→Toptancı, …). Each has:
  - `<animate attributeName="cx" ...>` moving from segment start to segment end.
  - `<animate attributeName="r" ...>` shrinking from a starting radius proportional to the *incoming* node's pct down to a radius proportional to the *outgoing* node's pct (so the particle visibly gets smaller as it crosses each middleman — the "bite" at every handoff).
  - `<animate attributeName="opacity" ...>` fading `1 → 0.35` across the segment.
  - Small `<text>` label `₺` next to the particle, following via the same `cx` animation.
  - Segments are staggered with `begin="0s; 0.6s; 1.2s; ..."` so the eye sees a wave of erosion moving left→right, then it loops (`repeatCount="indefinite"`, total cycle ~4s).
- At each node boundary a tiny static "bite" wedge (`<path>` triangle notch) in `--lp-earth` at 25% opacity, purely decorative, reinforcing the step‑down.

**Hasat — "direct flow":**
- A single straight line Çiftçi→Alıcı in `--lp-primary`, drawn with `stroke-dasharray` + animated `stroke-dashoffset` for a subtle continuous "flowing" shimmer (same technique as existing `lp-draw` keyframe, but looping instead of one‑shot).
- Layered on top, 3 `<circle>` particles traveling left→right continuously with staggered `begin` (0s, 0.8s, 1.6s), constant radius, opacity pulsing gently (0.6→1→0.6). Loop `3s`, `repeatCount="indefinite"`.
- No shrinkage, no fade‑out at the end — particles arrive at Alıcı at full size, contrast with the eroding traditional particles right above.

All animation uses SMIL `<animate>` inside SVG (native, no library, no rAF loop) plus one or two new `@keyframes` in `LandingStyles` for the dashed line shimmer. Mobile (`< 640px`): SVG scales with the container; particle count on traditional reduced to 3 (every other segment) via a `hidden sm:block` split, or kept the same — leaning toward keeping all 5 since SMIL is cheap. Prefers‑reduced‑motion: wrap the animations in `@media (prefers-reduced-motion: reduce)` to freeze `<animate>` via `begin="indefinite"` fallback — simplest is to set `animation-play-state: paused` on the shimmer and rely on SMIL respecting the media query is not guaranteed, so we'll add a CSS rule `@media (prefers-reduced-motion: reduce) { .lp-chain-anim { display: none } }` and show only the static line + nodes.

### Headline ↔ chain connection

- Wrap each headline callout card + its chain card in a shared parent `<div className="lp-chain-group lp-chain-group--trad">` / `--hasat`.
- On `:hover` of the group, the chain card below gets a soft outer glow (`box-shadow: 0 0 0 3px color-mix(in oklab, var(--lp-earth) 25%, transparent)` for traditional, same with `--lp-primary` for Hasat) via CSS only.
- Timing sync: the SMIL animations use the same loop lengths (~4s traditional, ~3s Hasat) that already feel calm. The `CountUp` completing is a one‑shot on reveal — we don't try to trigger a JS pulse from it. Instead, the shared color accent (earth vs primary) between callout card and chain card provides the "these belong together" cue, plus the hover glow is the discoverable secondary connection. Judgment call per the brief: shared color + shared row grouping is enough, no cursor tracking.

### Caption text

- Traditional caption stays: "Ortalama olarak son tüketicinin ödediği her ₺100'ün yalnızca ~₺14'ü üreticide kalıyor."
- Hasat caption stays: "Şeffaf komisyon: %5. Ödeme doğrudan çiftçinin IBAN'ına."

### CSS additions (appended inside existing `<style>` block in `LandingStyles`)

```css
@keyframes lp-flow-dash { to { stroke-dashoffset: -24 } }
.lp-flow-line { stroke-dasharray: 4 6; animation: lp-flow-dash 1.4s linear infinite; }
.lp-chain-group:hover .lp-chain-card--trad { box-shadow: 0 0 0 3px color-mix(in oklab, var(--lp-earth) 25%, transparent); }
.lp-chain-group:hover .lp-chain-card--hasat { box-shadow: 0 0 0 3px color-mix(in oklab, var(--lp-primary) 25%, transparent); }
@media (prefers-reduced-motion: reduce) {
  .lp-chain-anim { display: none; }
  .lp-flow-line { animation: none; }
}
```

### Verification

- `bunx tsgo --noEmit` at the end. Visual spot check via preview screenshot to confirm both chains render, particles animate, no layout regression on mobile.

### ASCII sketch

```text
┌─── traditional card ─────────────────────────────────────────┐
│ Geleneksel                                                   │
│ [Çiftçi]─·₺─►[Aracı]─·₺─►[Toptancı]─·₺─►[Dist.]─·₺─►[Per.]─·₺─►[Tük.] │
│  ██        ██          ██            ██          ██         █ │
│ 100%      62%         46%           32%         22%        14%│
│ caption…                                                     │
└──────────────────────────────────────────────────────────────┘
┌─── hasat card ───────────────────────────────────────────────┐
│ Hasat ile                                                    │
│ [Çiftçi] ═·····○·····○·····○═► [Alıcı]                       │
│  ██████                        █████                         │
│ 100%                            95%                          │
│ caption…                                                     │
└──────────────────────────────────────────────────────────────┘
```