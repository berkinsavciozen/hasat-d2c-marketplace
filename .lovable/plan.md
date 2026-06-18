# Mobile vs Desktop Parity (Farmer)

The desktop sidebar exposes routes and context that the mobile shell hides. This plan closes the gap without touching desktop layout.

## Audit findings

Desktop-only on the farmer shell (`src/routes/farmer.tsx`):
- Sidebar links: **Topluluk**, **Teklifler** (badge), **Premium'a Geç**, **Settings/profile pill**
- Context widgets: **FarmPill** (city · area · crop), **SeasonBanner**

Mobile bottom nav has only the 5 main tabs. Other farmer pages on mobile lose all sidebar context.

Buyer shell is at parity already — no changes there.

## Changes

### 1. Bottom nav: replace 5th tab with "Daha" (More)

`src/routes/farmer.tsx`

- Mobile bottom-nav tabs become: **Ana Sayfa · Günlük · Fiyatlar · Vitrin · Daha**
- "Analitik" moves out of the bottom row into the Daha sheet (still reachable on desktop sidebar — sidebar list unchanged).
- "Daha" is a `<button>` (not a Link) that opens a bottom Sheet (use existing `src/components/ui/sheet.tsx` with `side="bottom"`, or `Drawer`).
- Active state for "Daha": highlight when current pathname matches any of its inner items.

Sheet contents (vertical list, dark theme to match sidebar):
- Profile row at top: avatar + `displayName` + `city` → links to `/farmer/settings`
- **Analitik** → `/farmer/analytics`
- **Topluluk** → `/farmer/community`
- **Teklifler** → `/farmer/orders` (with badge `3`)
- **Premium'a Geç** → `/farmer/premium` (gold accent, matches sidebar style)
- **Ayarlar** → `/farmer/settings`
- Sheet closes on item tap (`onOpenChange(false)` via state).

### 2. FarmerHeader: always-on context on mobile

`src/routes/farmer.tsx` — the exported `FarmerHeader` component.

- Add `<FarmPill city area crop />` and `<SeasonBanner />` inside `FarmerHeader`, wrapped in a `md:hidden` block so desktop is unchanged (desktop already shows them in the sidebar).
- Pull data with the existing `useProfile()` + `useParcels()` hooks already used by `FarmerShell`. Compute `totalArea` and `primaryCrop` the same way.
- Remove the now-duplicate `<FarmPill>` + mobile-only `<SeasonBanner>` block currently inside `farmer.home.tsx` (lines ~35–40) so home doesn't render them twice.

### 3. Bottom nav layout

Keep the bottom nav `grid grid-cols-5`. The "Daha" cell uses the same `flex flex-col items-center` styling and a `MoreHorizontal` icon from lucide-react.

## Out of scope

- Buyer shell (already at parity).
- Desktop sidebar (unchanged).
- Any data-layer / business-logic changes.
- Onboarding / login routes.

## Files touched

- `src/routes/farmer.tsx` — bottom nav 5th tab → Daha sheet; `FarmerHeader` gets mobile-only FarmPill + SeasonBanner.
- `src/routes/farmer.home.tsx` — drop the duplicate mobile FarmPill/SeasonBanner block now rendered globally by FarmerHeader.
