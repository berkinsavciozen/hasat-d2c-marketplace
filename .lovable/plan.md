
## P11 — Inline Journal Entry Card from AI Chat

### Findings (from inspection)

- **Existing journal flow** (`src/routes/farmer.journal.new.tsx` + `useCreateEntry` in `src/lib/hasat/queries.ts`): inserts into `harvest_entries` with `{ farmer_id, parcel_id, crop, quantity, unit, quality, notes, costs, harvest_date, photo_urls: [] }`. Notes are encoded with `encodeNotes({ work, health, text })` producing `[work:<key>][health:<n>] <text>`. Costs default to `ZERO_COSTS = {labor,fertilizer,packaging,transport,other:0}`.
- **harvest_entries schema** (confirmed): `parcel_id uuid NOT NULL`, `farmer_id uuid NOT NULL`, `harvest_date date NOT NULL`, `crop text NOT NULL`, `quantity numeric NOT NULL`, `unit unit_type NOT NULL DEFAULT 'g'` (enum: `g|kg|L`), `quality quality_grade NOT NULL DEFAULT 'A'` (enum: `A|B|C`), `notes text NULL`, `costs jsonb NOT NULL DEFAULT {labor:0,fertilizer:0,packaging:0,transport:0,other:0}`, `photo_urls text[] NULL DEFAULT '{}'`. Only the PK index — **no unique constraint on (farmer_id, crop, harvest_date)**, so duplicate detection is purely a client-side soft check via SELECT.
- **Assistant rendering** (`FarmerAIChat.tsx`, `MessageBubble`): assistant content is currently passed directly through `renderMarkdown(m.content)` in a `dangerouslySetInnerHTML`. This is the single insertion point to intercept.
- **Message state shape** (`useAIChat.ts`, `ChatMessage`): `{ id, role, content, created_at, streaming? }`. Messages are appended both during streaming and after completion. The post-stream finalization happens in the `setMessages((m) => m.map(... { content: assistantText, streaming: false }))` line — that's where we can also stamp parsed journal data.
- **Parcels in context**: `fetchContextBlock` queries parcels but flattens them into the prompt string and discards the array. The hook does NOT expose parcels to the UI. The card will use the existing `useParcels()` query hook (already used by the journal page) — keeps the card self-contained.
- **No DB changes** needed.

### Architecture

1. **Parser util** (new) `src/components/hasat/ai-chat/parseJournalEntry.ts`:
   - `parseAssistantContent(raw)` → `{ visibleText, journal: ParsedJournal | null, parseError?: string }`.
   - Regex: `/\[JOURNAL_ENTRY\]([\s\S]*?)\[\/JOURNAL_ENTRY\]/`. First match only; subsequent blocks stripped from visible text and console-warned.
   - JSON-parses the inner payload. Validates required fields: `crop` (string), `quantity` (number-coercible), `unit` (one of `g|kg|L`, with mapping for common synonyms `gram→g`, `kilo|kilogram→kg`, `litre|liter→L`), `harvest_date` (YYYY-MM-DD; if missing, today). Optional: `quality` (A/B/C with mapping `iyi|good|kaliteli→A`, `orta|medium→B`, `düşük|kötü|low→C`; default A), `parcel_id`, `parcel_name`, `notes`, `costs` (object, sanitized to known keys + numbers).
   - On malformed JSON or missing required field: returns `journal: null` and `parseError`, leaves the original block in `visibleText` unchanged (fallback per spec).
   - Strips the matched block from `visibleText` and trims whitespace.

2. **State flag** in `useAIChat.ts`:
   - Extend `ChatMessage` with optional `journal?: ParsedJournal` (and the visible content already strips the block).
   - Apply parsing in **two** places:
     - On stream completion (just before `setMessages(... streaming:false)`): run `parseAssistantContent(assistantText)`, set `content = visibleText`, attach `journal`.
     - On `loadLatestSession` / `loadSession` row hydration: map each assistant row through the parser so historical journal cards re-render (in saved state — see #4).
   - Streaming partial chunks are NOT parsed (the block may be incomplete); during streaming, the raw text shows transiently — acceptable since the card replaces it the moment streaming ends.

3. **JournalEntryCard component** (new) `src/components/hasat/ai-chat/JournalEntryCard.tsx`:
   - Props: `{ initial: ParsedJournal; messageId: string }`.
   - Self-contained: uses `useParcels()` and `useAuthUserId()` directly; manages all field state locally.
   - Layout: rounded card with 1px lavender (`var(--lav)`) left border + soft lav-tinted background, inside the assistant bubble below the visible text.
   - Fields:
     - **Crop**: text input.
     - **Quantity**: numeric input.
     - **Unit**: 3-button segmented `g | kg | L`.
     - **Quality**: 3-button segmented `A | B | C`.
     - **Date**: native `<input type="date">`.
     - **Parcel**: native `<select>` populated from `useParcels()`. Pre-selection rules: explicit `parcel_id` match → case-insensitive `parcel_name` match → if exactly one parcel, auto-select → otherwise empty with "Parsel seçin" placeholder.
     - **Notes**: textarea (optional).
     - **Costs**: collapsed by default behind "Maliyet ekle" toggle; expands to a small repeater of `{label, amount}` rows. On save serialized as `{ labor, fertilizer, packaging, transport, other, ...customs }` merged onto `ZERO_COSTS`. Custom labels go under `other` summed; or stored as their own keys if they match known keys (`labor`/`fertilizer`/`packaging`/`transport`).
   - Local state machine: `idle → checking → warning(duplicate) → saving → saved | error`.
   - **Duplicate check**: on mount AND on date/crop change (debounced 250ms): `supabase.from('harvest_entries').select('id, quantity, unit, quality, notes, costs, parcel_id').eq('farmer_id', userId).eq('crop', crop).eq('harvest_date', date).maybeSingle()`. If found → set `existing` state, show inline warning banner.
   - Buttons:
     - Default: **Kaydet** (saffron) + **İptal** (ghost; collapses card via local `dismissed` flag — bubble keeps visible text).
     - With duplicate: **Yine de Kaydet** (saffron) + **Mevcut Kaydı Güncelle** (sage outline) + **İptal**.
   - Save: validates required fields (crop, qty>0, unit, quality, date, parcelId) — inline red helper text per missing field. Insert via `supabase.from('harvest_entries').insert({...})` mirroring the exact column shape from `useCreateEntry`. Notes are stored verbatim (no `encodeNotes` wrapper, since AI-authored notes don't have a `work`/`health` UI — keeps notes human-readable; this is consistent with the column being plain `text NULL`).
     - Update path: `supabase.from('harvest_entries').update({ quantity, unit, quality, notes, costs }).eq('id', existing.id)` — does not change `parcel_id` per spec.
   - On success: invalidate `["entries", userId]` query (so the journal page refreshes), enter `saved` state showing **✅ Kaydedildi** + `<Link to="/farmer/journal">Günlüğe git →</Link>`. Card becomes read-only.
   - On error: inline red banner "Kayıt sırasında bir hata oluştu. Tekrar deneyin." Fields stay editable.
   - **Persistence of saved state across reload**: when hydrating from DB, run the same duplicate check; if a matching `harvest_entries` row exists, render the card directly in `saved` state with the "Günlüğe git →" link. (No new schema needed.)

4. **Wiring in `FarmerAIChat.tsx` `MessageBubble`**:
   - When `m.role === 'assistant'`: render `m.content` (already stripped) via `renderMarkdown`, then if `m.journal` render `<JournalEntryCard initial={m.journal} messageId={m.id} />` below.
   - User bubbles unchanged.
   - When `m.content` is empty AND `m.journal` exists, suppress the bubble's text node so the card stands alone (no empty bubble background).

### Files

- New: `src/components/hasat/ai-chat/parseJournalEntry.ts`
- New: `src/components/hasat/ai-chat/JournalEntryCard.tsx`
- Edited: `src/components/hasat/ai-chat/useAIChat.ts` — extend `ChatMessage`, parse on stream completion + on session load.
- Edited: `src/components/hasat/ai-chat/FarmerAIChat.tsx` — `MessageBubble` renders the card when `m.journal` is set.

### Out of scope

- No DB schema changes. No edits to `farmer.journal.new.tsx`, `useCreateEntry`, or any journal page. No changes to streaming logic or system prompt. Photos/images on AI-created entries (stays empty array).

### Verification

1. Send "Bugün 2kg safran hasat ettim, kalite A" → after stream ends, the bubble shows AI's prose and a card pre-filled `crop=safran, qty=2, unit=kg, quality=A, date=today`.
2. Parcel pre-selected when farmer has one parcel; otherwise dropdown forces selection before Save.
3. Save inserts a row visible in Supabase + on `/farmer/journal`.
4. Saving the same crop+date again shows the duplicate warning with both action buttons.
5. Reload chat → previously-saved card still renders in saved state with "Günlüğe git →".
6. AI message without a `[JOURNAL_ENTRY]` block renders identically to P10 (no card, no regression).
