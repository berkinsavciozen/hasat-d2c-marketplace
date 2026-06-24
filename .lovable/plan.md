# P14 — AI Tier Experience Polish

## Findings (from inspection)

- **Limit UI today** (`FarmerAIChat.tsx` lines 269-273): inline text + plain `<a href="/farmer/premium">Premium'a geç →</a>`. Triggered when `tier==='free' && usageCount>=50` or `chat.limitReached`. This is the only existing limit surface.
- **Settings** (`src/routes/farmer.settings.tsx`): clean `Section` pattern — Profil / Parsellerim / Sertifikalar / Bildirim Tercihleri link / Hesap. Natural insertion: new `Section title="AI Asistan"` right after Profil (so plan/tier sits with identity).
- **Profile display**: settings Profil section is the only place name/city are shown. Tier badge goes here, next to the avatar/name block.
- **`farmer.premium.tsx`**: untouched — modal just navigates to `/farmer/premium`.
- **AIBox**: no coach-mark logic exists. Need to add self-contained overlay gated on `localStorage["hasat_aibox_coach_dismissed"]`, only after insights render (not during skeleton/empty).
- **`notif_prefs`**: has typed boolean cols (no JSONB grab-bag). Coach-mark state → **localStorage** (matches existing `hasat_ai_chat_coach_dismissed` pattern).
- **`profiles.tier`**: column exists but NOT in `useProfile()` SELECT (`id, name, city, role, phone` only). Must extend SELECT + `ProfileRow` type. `fetchTier()` in `useAIChat.ts` already reads it separately — keep as-is to avoid touching chat logic.
- **Sheet vs Dialog**: app uses `Sheet` bottom sheets consistently → use Sheet for upgrade modal.
- **WhatsApp number**: none configured in code. Use a named constant `HASAT_WHATSAPP_NUMBER` in a new shared file with a TODO comment.

## Changes

### New files

1. **`src/components/hasat/UpgradeModal.tsx`** — shared bottom-sheet modal.
   - Props: `open`, `onOpenChange`.
   - Title "Bu ay AI limitine ulaştınız" (Sparkles icon, lav color), body copy as specified, primary "Premium'a Geç" (saffron) → `navigate({to:'/farmer/premium'})` + close, secondary "Belki Sonra" ghost → close.

2. **`src/lib/hasat/constants.ts`** — `export const HASAT_WHATSAPP_NUMBER = "905555555555"; // TODO: replace with real business WhatsApp number`.

3. **`src/components/hasat/TierBadge.tsx`** — small chip. `"Ücretsiz"` = muted cream/gray bg, dark text. `"Premium"` = gold (#D4A843) bg, dark text. Props: `tier: "free"|"premium"`.

### Edits

4. **`src/lib/hasat/queries.ts`**
   - `ProfileRow`: add `tier: "free"|"premium"|null`.
   - SELECT: add `tier`.
   - New hook `useAIUsageThisMonth()` — query `ai_usage_tracking` for current `YYYY-MM`, returns `{ count: number }`, `staleTime: 60_000`. Returns 0 when no row.

5. **`src/components/hasat/ai-chat/FarmerAIChat.tsx`**
   - Add `upgradeOpen` state + `<UpgradeModal>` instance.
   - Replace the limit block (269-273) with a button that opens the modal (keep same wording, button instead of `<a>`).
   - In header just below the title row (inside the message-list top), add a subtle WhatsApp link: small muted text + WhatsApp-green icon (`MessageCircle` from lucide, color `#25D366`), label "WhatsApp'tan da yazabilirsin →", `<a href={`https://wa.me/${HASAT_WHATSAPP_NUMBER}`} target="_blank" rel="noopener">`. Does not close panel.

6. **`src/routes/farmer.settings.tsx`**
   - Add tier badge next to name/avatar in Profil section using `<TierBadge tier={profile?.tier ?? 'free'} />`.
   - New `<Section title="AI Asistan">` after Profil:
     - Row 1: "Üyelik" + `<TierBadge>`.
     - If free: "Bu ay AI mesajları" + `X / 50` + mini progress bar (same green/amber/red thresholds as `UsageMeter`). Then "Premium'a Geç →" button that opens `<UpgradeModal>`.
     - If premium: sage-colored "Sınırsız AI sohbeti" row, hide usage + upgrade button.
   - Local `upgradeOpen` state + mount `<UpgradeModal>`.

7. **`src/components/hasat/AIBox.tsx`**
   - Add `showCoach` state: on mount, if `localStorage["hasat_aibox_coach_dismissed"] !== "1"` AND insights are rendered (not loading/empty/error), show overlay tooltip.
   - Overlay: absolutely positioned dark chip pointing to insight list, text "✨ Bu kutu verilerine göre kişisel AI analizi gösterir. Detay için bir öneriye dokun."
   - Dismiss: click anywhere (tooltip + a transparent full-page click-catcher) → set flag + hide.
   - Module-level `coachShownThisSession` guard so only the first AIBox on the page shows it.

## Out of scope

No DB / RLS / edge function / chat-streaming changes. `farmer.premium.tsx` untouched. No new tables (coach mark = localStorage).

## Report to deliver after build

- WhatsApp constant: `HASAT_WHATSAPP_NUMBER` in `src/lib/hasat/constants.ts` (placeholder `905555555555`).
- Upgrade modal: `src/components/hasat/UpgradeModal.tsx`, reused by chat limit state + settings.
- `profiles.tier` added to `useProfile()` SELECT and `ProfileRow` type.
