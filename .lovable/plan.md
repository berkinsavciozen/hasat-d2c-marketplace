## Phase 1 — Real Supabase Phone OTP Auth (revised)

Replace the mock OTP/onboarding flow with real Supabase Auth. UI, routes, and Zustand store shape unchanged; only the data layer changes. Browser `supabase` client at `@/integrations/supabase/client` is reused; no server functions, no migrations.

### 1. Store change
`src/lib/hasat/types.ts` — add optional `id?: string` to `User` so we can stash `auth.users.id` via the existing `updateUser` patch.

### 2. Login screen (`src/routes/login.tsx`)
- **Send OTP**:
  ```ts
  await supabase.auth.signInWithOtp({
    phone: '+90' + phoneDigits,
    options: {
      channel: channel === 'wa' ? 'whatsapp' : 'sms',
      data: { role }, // 'farmer' | 'buyer' from existing Route.useSearch()
    },
  });
  ```
  Error → `toast.error(error.message)`. Success → advance to OTP step + start 30s countdown.
- **Verify OTP**:
  ```ts
  const { data, error } = await supabase.auth.verifyOtp({
    phone: '+90' + phoneDigits,
    token: otp.join(''),
    type: 'sms',
  });
  ```
  Error → toast and stay. Success → fetch profile via `useQueryClient().fetchQuery` keyed `['profile', data.user.id]`:
  `supabase.from('profiles').select('*').eq('id', data.user.id).single()`.
  A DB trigger auto-creates the `profiles` row on `auth.users` insert (seeding `role` from `user_metadata.role` set above), so the row always exists. Branch on **`profile.name`**:
  - `profile.name` null/empty → new user → `setRole(profile.role)`, `updateUser({ id: data.user.id })`, navigate to `/onboarding/${profile.role}`.
  - `profile.name` non-empty → returning user → `setRole(profile.role)`, `updateUser({ id, name, phone, premium })`, navigate to `/farmer/home` or `/buyer/discover` based on `profile.role`.
- Resend reuses `signInWithOtp` with same options.

### 3. Farmer onboarding (`src/routes/onboarding.farmer.tsx`)
On final-step CTA:
1. `const { data: { user } } = await supabase.auth.getUser()`; if no user → toast + navigate `/login?role=farmer`.
2. `await supabase.from('profiles').upsert({ id: user.id, role: 'farmer', name, city, phone: user.phone, premium: false })`.
3. Selected certifications → `Promise.all` of `supabase.from('certifications').insert({ farmer_id: user.id, type: certType })`.
4. Any error → `toast.error`, stay.
5. Success → `setRole('farmer')`, `updateUser({ id: user.id, name, premium: false, ...existing patch })`, navigate `/farmer/home`.

### 4. Buyer onboarding (`src/routes/onboarding.buyer.tsx`)
On final-step CTA:
1. `getUser()` guard → fallback `/login?role=buyer`.
2. `await supabase.from('profiles').upsert({ id: user.id, role: 'buyer', name: companyName, phone: user.phone })`.
3. `await supabase.from('buyer_profiles').insert({ user_id: user.id, company_name: companyName, company_type: companyType, monthly_volume: volumeSelection })`.
4. Errors → toast, stay. Success → `setRole('buyer')`, `updateUser({ id: user.id, ...existing })`, navigate `/buyer/discover`. Trial `Switch` keeps existing local `setPremium(true)`.

### 5. Session bootstrap (`src/routes/__root.tsx`)
Mount `<AuthBootstrap />` inside `RootComponent` before `<Outlet />`. In a `useEffect`:
- `supabase.auth.getSession()` → if `session.user`, fetch `profiles` row; populate Zustand `setRole` + `updateUser` when `profile.name` is set (otherwise leave role null — user is mid-onboarding).
- Subscribe `supabase.auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT') { reset(); router.navigate({ to: '/' }); } })`. Cleanup unsubscribes.
- No protected-route gating in Phase 1.

### 6. Logout
`src/routes/farmer.settings.tsx` and `src/routes/buyer.account.tsx` — replace `reset()` + navigate handler with:
```ts
try { await supabase.auth.signOut(); }
catch (e) { toast.error((e as Error).message); }
finally { navigate({ to: '/' }); } // onAuthStateChange also resets store
```

### 7. Kept as-is
- `RoleSwitcher` FAB stays mounted.
- No changes to UI components, route layouts, Zustand action signatures, seed data, business screens, RLS, or schema.

### Files touched
- `src/lib/hasat/types.ts` — add `id?: string` to `User`.
- `src/routes/login.tsx` — real `signInWithOtp` (with `data.role`) + `verifyOtp` + `profile.name` branching.
- `src/routes/onboarding.farmer.tsx` — profile upsert + certifications insert.
- `src/routes/onboarding.buyer.tsx` — profile upsert + buyer_profiles insert.
- `src/routes/__root.tsx` — `AuthBootstrap` (getSession + onAuthStateChange).
- `src/routes/farmer.settings.tsx`, `src/routes/buyer.account.tsx` — real `signOut`.
