# Fix journal entry AI flow

The system prompt is in `src/components/hasat/ai-chat/useAIChat.ts` (`buildSystemPrompt`, line 59), not in the edge function. The edge function is a transparent SSE proxy. I'll update the prompt at its real source and harden the parser.

## 1. `src/components/hasat/ai-chat/useAIChat.ts`

Replace the single-line journal instruction at line 68 with the spec'd block:

```
Çiftçi günlük kaydı eklemek isterse:

Gerekli bilgileri topla (ürün, miktar, birim, tarih, parsel). Eksik bilgi varsa sor.

Tüm bilgiler hazır olduğunda, cevabının SONUNA şu formatı AYNEN ekle:
[JOURNAL_ENTRY]{"crop":"...","quantity":5,"unit":"kg","harvest_date":"YYYY-MM-DD","parcel_name":"...","quality":"A","notes":"..."}[/JOURNAL_ENTRY]

ÖNEMLİ: Kaydın oluşturulduğunu SÖYLEME. "Kaydettim", "oluşturdum", "başarıyla ekledim" gibi ifadeler kullanma.

Bunun yerine şunu söyle: bilgileri özetleyen kısa bir cümle + "Aşağıdaki kartı onaylarsanız kaydedeceğim."

Zorunlu alanlar: crop (text), quantity (sayı), unit ("g" veya "kg" veya "L"), harvest_date (YYYY-MM-DD). Opsiyonel: parcel_name, quality ("A" veya "B" veya "C", yoksa "A"), notes.
```

No other part of the prompt changes. Edge function (`ai-chat-stream`) is not touched — it just proxies.

## 2. `src/components/hasat/ai-chat/parseJournalEntry.ts`

After `JSON.parse(inner)`, insert a normalization step that builds a clean payload before required-field validation:

- `harvest_date` ← `payload.harvest_date ?? payload.date`
- `parcel_name` ← `payload.parcel_name ?? payload.parcel ?? payload.field`
- `notes` ← `payload.notes ?? payload.note`
- `crop`, `quality` passthrough
- `status` discarded
- `quantity` / `unit`:
  - if `payload.quantity` is a number → use as-is with `payload.unit`
  - if `payload.quantity` is a string like `"5g"`, `"5 kg"`, `"2.5 L"` → split numeric + unit suffix
  - else fall back to `payload.amount`, parsed the same way (`/^(\d+(?:[.,]\d+)?)\s*(g|gr|kg|kilo|l|lt|litre)$/i`); comma decimals normalized to dot
  - unit then passed through existing `mapUnit`

Existing required-field validation, `mapQuality`, `normalizeDate`, `sanitizeCosts`, and the `BLOCK_RE_G` strip stay unchanged.

## 3. Regex check

`/\[JOURNAL_ENTRY\]([\s\S]*?)\[\/JOURNAL_ENTRY\]/` matches the spec'd block byte-for-byte; no change needed. The visible-raw-block bug is explained entirely by required-field failure (`amount`/`date`/`field` schema), which the normalization above fixes — on failure the parser currently returns `visibleText: raw`, leaving the block in the bubble.

## Out of scope

- No DB / RLS / other edge function changes
- `JournalEntryCard` UI unchanged
- `whatsapp-ai-webhook` prompt not touched (separate channel, not in bug scope)
- No change to `ai-chat-stream/index.ts`

## Verification

Send "Kuzey parselinden 5 gram safran hasat ettim, kalite A" in the in-app chat → AI replies with summary + "Aşağıdaki kartı onaylarsanız kaydedeceğim.", no raw `[JOURNAL_ENTRY]` text visible, `JournalEntryCard` renders with crop=safran, quantity=5, unit=g, quality=A, today's date, parcel=Kuzey, Kaydet/İptal buttons functional.
