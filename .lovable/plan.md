## Phase 5 — File uploads + payment polish

### 5A — Certification upload (farmer.settings.tsx)

**queries.ts**
- `useUploadCertification()` — mutation `{ type, file, expiresAt? }`:
  1. `supabase.storage.from('certificates').upload(`${userId}/${Date.now()}-${file.name}`, file)` (private bucket)
  2. Insert `certifications` row: `{ farmer_id: userId, type, document_url: path, expires_at, verified_at: null }`
  3. Invalidate `['certifications', userId]`
- `useDeleteCertification()` — mutation `{ id, document_url }`: delete DB row + `storage.from('certificates').remove([document_url])`, invalidate.
- `useCertificationSignedUrl(path)` — helper returning a 1-hour signed URL on demand (used when user taps a row to view).

**farmer.settings.tsx — Sertifikalar Section**
- Replace static empty state with:
  - List existing certs (already wired) + add a delete (trash) button per row.
  - "Sertifika Ekle" button opens a Sheet with: `type` Select (enum values from cert_type), optional `expires_at` date input, file picker (PDF/image), Save.
- Save calls `useUploadCertification`. Toast success/error. `LoadingDots` while pending.
- Tapping a cert row opens its signed URL in a new tab.

### 5B — Listing photo upload (farmer.storefront.tsx)

**queries.ts** — extend existing mutations:
- `useCreateListing()` accepts optional `photoFile?: File | null`. If present:
  1. Insert listing first to get `id`.
  2. Upload to `harvest-photos/{userId}/{listingId}/{filename}`.
  3. Get public URL via `getPublicUrl`, then `update listings set photo_urls = ARRAY[publicUrl] where id = listingId`.
  4. Invalidate listings.
- `useUpdateListing()` accepts optional `photoFile`. Same upload path, replaces `photo_urls` with `[publicUrl]` (single-element array).

**farmer.storefront.tsx — ListingSheet**
- Add file input (image/*) above "Yayınla" button. Local preview via `URL.createObjectURL`.
- Pass `photoFile` to mutation. Reset on close.

**ListingCard**: if `listing.photos[0]` exists, render `<img>` thumbnail in the 12×12 slot instead of the emoji.

### 5C — Buyer payment (buyer.payment.tsx)

Per the user's choice, keep current behavior (submit offer → success screen). Only polish:
- Confirm `LoadingDots`/disabled state on submit (already present via `createOffer.isPending`).
- Toast success after offer creation: "Teklifiniz gönderildi".
- No `useCreateOrder` work in this phase.

### General
- Storage paths follow `{userId}/...` to match existing RLS.
- Public URLs for `harvest-photos`; signed URLs (3600s) on demand for `certificates`.
- `LoadingDots` on all async paths; toasts on success and error.
- No DB migrations.

### Files touched
- `src/lib/hasat/queries.ts` — new cert hooks; extend `useCreateListing`/`useUpdateListing` with `photoFile`.
- `src/routes/farmer.settings.tsx` — cert add/delete UI + view via signed URL.
- `src/routes/farmer.storefront.tsx` — photo picker in sheet, thumbnail in card.
- `src/routes/buyer.payment.tsx` — minor toast/copy only (no flow change).

### Out of scope
- No `useCreateOrder`, no offer→order chain.
- No `photo_url` migration; sticking with `photo_urls[0]`.
- No multi-photo gallery; single-photo replace semantics.
