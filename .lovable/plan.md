## SupplyChain — compact single-bar redesign (plain CSS)

Root-cause note: SMIL `<animate>` with computed `from`/`to` on a `preserveAspectRatio="none"` viewBox inside a re-rendered React tree ships fine to Chrome but frequently no-ops (particles stay hidden or freeze at initial state) — combined with the absolutely-positioned overlay having `height: 36px` while the viewBox is `100x20` non-uniformly stretched, the particles collapse to invisible sub-pixel radii. Rather than patch, we throw out the SVG overlay and the N‑column grid, and replace with a single horizontal bar per chain animated with plain CSS.

Scope: `src/routes/index.tsx` — replace current `ChainCard` implementation; `SupplyChain` wrapper (headline callouts, groups, section chrome, hover‑glow classes) stays as‑is. Existing `.lp-chain-group` / `.lp-chain-card--trad` / `.lp-chain-card--hasat` hover‑glow CSS is reused; SMIL‑era `.lp-flow-line` / `@keyframes lp-flow-dash` removed and replaced with new keyframes.

### Visual design

Compact single row per chain (~110px tall vs current ~200px):

```text
Geleneksel
├──────────────────────────────────────────────────────────────┤   ← track (full width, muted)
│████████████│██████████│████████│██████│████│██│░░░░░░░░░░░░░│   ← 6 stacked segments,
│    100%    │   62%    │  46%   │ 32%  │22% │14│                    each width = pct-delta of total,
Çiftçi      Aracı     Toptancı  Dist.  Per. Tük.                    darker earth on left,
                                                                     fading toward transparent right
                          ● ← ₺ marker travels L→R, shrinks at each boundary

Hasat ile
├──────────────────────────────────────────────────────────────┤
│█████████████████████████████████████████████████████████████░│   ← single solid primary fill 95%
│                            100%                              │
Çiftçi                                                    Alıcı
● ─────────────────────────────────────────────────────────► ●   ← ₺ marker travels full length,
                                                                     constant size, gentle pulse
```

### Bar structure

Both chains use the same wrapper: a full‑width track (`height: 28px`, `border-radius: 14px`, background `color-mix(in oklab, var(--lp-line) 60%, transparent)`) with children absolutely positioned inside.

**Geleneksel** — 6 segments rendered as inline‑flex children whose widths correspond to the *drop* between consecutive pcts, normalized so the total spans 100% of the track. Concretely, segment widths derived from the pcts (100, 62, 46, 32, 22, 14) become the on‑track widths (100, 62, 46, 32, 22, 14) each scaled by 100/sum → widths in %. Each segment is filled with `--lp-earth` at descending alpha (`opacity: 1, 0.82, 0.66, 0.5, 0.36, 0.22`), giving a stepped, visibly eroding gradient. Thin 1px gap between segments (via `box-shadow: inset -1px 0 0 var(--lp-cream-2)`) makes each handoff readable.

Node labels sit in a second row directly below the track: a 6‑column CSS grid with `gridTemplateColumns` matching the segment widths so each label lines up under its segment. Labels are `text-[10px] md:text-[11px]`, muted color, single line. The `%` value renders inside the segment when width allows (`>= 8%`), otherwise omitted.

**Hasat ile** — single filled bar at 95% width with `background: var(--lp-primary)`; remaining 5% is track. Two labels ("Çiftçi", "Alıcı") in a 2‑column grid below, aligned to the far ends. A small centered `%100 → %95` legend can be dropped; the caption below already carries the point.

### Marker animation (plain CSS keyframes)

One `<span>` marker per chain, absolutely positioned on top of the track, `top: 50%; transform: translate(-50%, -50%)`. Marker is a small circle with a `₺` glyph inside (`width: 18px; height: 18px; border-radius: 50%; background: <accent>; color: white; font-size: 10px; display: grid; place-items: center`).

**Traditional marker keyframes** — 6s loop, `linear`, `infinite`. Uses `left` (not `transform: translateX(%)`) so the % refers to the track width. Six equal‑time steps traverse the six segment boundaries; at each boundary the marker shrinks (`scale`) proportional to the pct at that node, and its opacity drops slightly:

```css
@keyframes lp-erode {
  0%   { left: 0%;   transform: translate(-50%, -50%) scale(1.00); opacity: 1;   }
  16%  { left: 50%;  transform: translate(-50%, -50%) scale(1.00); opacity: 1;   } /* end of Çiftçi (100%) */
  17%  { left: 50%;  transform: translate(-50%, -50%) scale(0.78); opacity: 0.9; } /* enter Aracı */
  33%  { left: 81%;  transform: translate(-50%, -50%) scale(0.78); opacity: 0.9; }
  34%  { left: 81%;  transform: translate(-50%, -50%) scale(0.62); opacity: 0.8; }
  50%  { left: 104%; transform: translate(-50%, -50%) scale(0.62); opacity: 0.8; }
  /* …continues through 32→22→14, ending faded out past the right edge… */
  100% { left: 100%; transform: translate(-50%, -50%) scale(0.18); opacity: 0;   }
}
```

The `left` stops are computed from the cumulative segment widths (mid‑segment travel + instantaneous "bite" scale change at each boundary — a stepwise erosion that mirrors the segmented bar underneath). Full 6‑step keyframe list is written in‑file; the sketch above is a shorthand.

**Hasat marker keyframes** — 3s loop, `ease-in-out`, `infinite`. Single continuous travel `left: 0% → 100%`, `scale` constant, opacity `0 → 1 → 1 → 0` (fade in at start, fade out at end) so the marker "arrives" cleanly and restarts without a hard jump:

```css
@keyframes lp-flow {
  0%   { left: 0%;   opacity: 0; }
  10%  { left: 8%;   opacity: 1; }
  90%  { left: 92%;  opacity: 1; }
  100% { left: 100%; opacity: 0; }
}
```

### Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  .lp-marker { animation: none; opacity: 0; }
}
```

Track and segments stay fully visible — the erosion is already legible from the stepped fill alone; the marker is pure ornament.

### Files touched

`src/routes/index.tsx`:
1. `LandingStyles` — remove `@keyframes lp-flow-dash` and `.lp-flow-line`; add `@keyframes lp-erode`, `@keyframes lp-flow`, `.lp-marker` base rule, and the `prefers-reduced-motion` override. Keep the existing `.lp-chain-group:hover .lp-chain-card--trad|hasat` glow rules unchanged.
2. `ChainCard` — rewrite. Remove the SVG overlay, the N‑column pill grid, the vertical per‑node bars, and the `xAt`/`rFor` helpers. Render: eyebrow row (unchanged), the single track + marker described above, the aligned label grid, then the existing caption block.
3. `SupplyChain` — no changes to headline callouts, group wrappers, or captions. The two `ChainCard` invocations already pass `variant`, `nodes`, `caption` — signature is preserved.

### Verification

- `bunx tsgo --noEmit`.
- Visual: preview screenshot to confirm both bars render, marker travels and shrinks (traditional) / flows (Hasat), hover glow still fires, mobile stacked layout still readable.