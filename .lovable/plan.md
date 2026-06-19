# Phase 8 polish

Four small, surgical fixes. No schema, no new hooks.

## 1. Farmer sidebar chips (`src/routes/farmer.tsx`)

Current code already calls `useProfile()` + `useParcels()` and feeds `<FarmPill>`, but:
- `area` field is named `area` (not `size`) in `Parcel` — fine, keep.
- Crop list lives in `parcels[].crops: string[]` (not `crop_type`). Current code takes `parcels[0].crops[0]` only.
- When the farmer has no parcels yet, `totalArea` becomes `0` ("0 dönüm") and `primaryCrop` stays `"—"`. The user wants a dash fallback in that case too.

Changes (both shell instances — desktop sidebar lines 55–65 and mobile shell lines 232–236):
- Compute `mostCommonCrop`: flatten `parcels.flatMap(p => p.crops ?? [])`, count occurrences, pick the highest; fall back to first parcel's first crop. If no crops, `"—"`.
- Show area as `"—"` when `parcels.length === 0`, otherwise `${totalArea} dönüm` (formatted via `<FarmPill>` which already appends "dönüm").
- City stays as `profile?.city ?? "—"` (already correct).
- During `useProfile().isLoading` / `useParcels().isLoading`, all three render `"—"`.

Pass already-formatted strings into `<FarmPill>`. To avoid changing the FarmPill API ("area: number"), accept `area: number | null` and render `"—"` when null. Tiny one-line change in the component.

## 2. Buyer "Tekliflerim" default tab (`src/routes/buyer.orders.tsx`)

Line 30: `useState("active")` → `useState("offers")`. One-character change. No other behavior touched.

## 3. Empty-state audit

The three target routes already have empty-state branches but they're inconsistent. Bring them in line with the `farmer.community.tsx` pattern (centered emoji + text inside a dashed card).

- **`farmer.community.tsx` line 80–84** — already centered icon + text; tweak the empty copy to match the requested string: `"Henüz gönderi yok. İlk gönderiyi sen paylaş!"` when `posts.length === 0` (keep "Sonuç bulunamadı" for the search-no-match branch).
- **`buyer.subscriptions.tsx` line 47–50** — wrap the existing dashed card in the same shape, add a `🌾` icon above the text. Copy: `"Henüz aboneliğiniz yok."` (matches user's wording — current one says "abonelik oluşturmadınız").
- **`buyer.reports.tsx` line 68–71** — same treatment, add a `📊` icon above the text. Keep existing copy `"Henüz tamamlanmış siparişiniz yok."`.

All three use the same shell:
```
text
<div className="rounded-2xl border border-dashed p-10 text-center text-hmuted">
  <div className="text-4xl mb-2">{emoji}</div>
  {message}
</div>
```

## 4. Profile-completion nudge

A controlled banner that hides as soon as the name input has any non-whitespace value.

- **`src/routes/farmer.settings.tsx`** — already has `name` state (line 31) and a name `<Input>` (line 92). Add above the form (just before the avatar block, line ~85):
  ```tsx
  {!name.trim() && (
    <div className="rounded-xl border border-saffron/40 bg-saffron/10 px-4 py-3 text-sm text-saffron">
      Profilinizi tamamlayın — alıcılar sizi tanısın.
    </div>
  )}
  ```
  This auto-hides as the user types, no extra effect needed (it's tied to `name`, not the persisted profile).

- **Buyer equivalent (`src/routes/buyer.account.tsx`)** — read-only screen today, no name input. Show the same banner at the top when `useProfile().data?.name` is empty/whitespace, *not* gated on input state (there's nothing to type into). Hides automatically once the profile name is set elsewhere. This keeps the nudge consistent across roles without adding an editor.

# Files touched

- `src/routes/farmer.tsx` — sidebar chip computation (both shells), pass through.
- `src/components/hasat/FarmPill.tsx` — accept nullable area, render `"—"`.
- `src/routes/buyer.orders.tsx` — default tab string.
- `src/routes/farmer.community.tsx` — empty copy.
- `src/routes/buyer.subscriptions.tsx` — add icon + tweak copy.
- `src/routes/buyer.reports.tsx` — add icon.
- `src/routes/farmer.settings.tsx` — banner above form.
- `src/routes/buyer.account.tsx` — banner above account card.

No new hooks, no migrations, no layout shifts.
