# P9-B — WhatsApp AI Webhook (Edge Function)

## Inspection findings

- **Existing edge function**: only `send-sms`. Uses `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID` (already secrets). New function reuses none of these for the inbound TwiML reply path.
- **AI**: no existing AI calls. Use Lovable AI Gateway (`https://ai.gateway.lovable.dev/v1/chat/completions`) with `LOVABLE_API_KEY` (already a secret), model `google/gemini-3-flash-preview`.
- **profiles.phone**: format inconsistent (`+905001234567` and `905007654321` both exist). Lookup must try both forms.
- **harvest_entries**: `parcel_id NOT NULL`; `quality` is enum `quality_grade` accepting only `'A' | 'B' | 'C'`.
- **P9-A confirmed**: `ai_chat_messages`, `ai_usage_tracking`, `can_send_ai_message`, `increment_ai_usage`, `profiles.tier` all in place.

## Function: `supabase/functions/whatsapp-ai-webhook/index.ts`

Public webhook (Twilio cannot send a Supabase JWT). Add `[functions.whatsapp-ai-webhook]` with `verify_jwt = false` to `supabase/config.toml`.

### Flow

1. Parse `application/x-www-form-urlencoded` body. Extract `From`, `Body`.
2. Normalize phone: strip `whatsapp:` prefix → `raw`. Build candidates `[raw, raw without leading '+', '+' + raw if missing]`.
3. Look up `profiles` where `phone = ANY(candidates) AND role='farmer'`. None → reply `"Hasat uygulamasına kayıt olmak için: hasat.lovable.app"`, stop.
4. RPC `can_send_ai_message(user_id)`. False → reply premium upsell, stop.
5. Fetch context in parallel (service role):
   - last 10 `ai_chat_messages` for user (newest first, then reversed).
   - last 5 `harvest_entries` (`crop, quantity, unit, quality, harvest_date`).
   - active `listings` (`status='active'`) for farmer.
   - pending `offers` count + oldest pending date.
   - farmer's `parcels` (`id, name, crops`) — for journal auto-save resolution.
6. Build system prompt per spec, interpolating `farmer_name`, `city`, plus a compact context block (recent harvests, active listings, pending offers, parcel list).
7. Call Lovable AI Gateway, model `google/gemini-3-flash-preview`. Handle 429/402/non-2xx → return generic Turkish error reply, do NOT save or increment.
8. Parse `[JOURNAL_ENTRY]{json}[/JOURNAL_ENTRY]` in AI reply:
   - Required: `crop, quantity, unit, harvest_date`. Optional: `quality`, `parcel_id` or `parcel_name`, `notes`.
   - Resolve `parcel_id`: explicit id (verify ownership) → match `parcel_name` against farmer's parcels (case-insensitive) → if exactly one parcel, use it.
   - **Quality mapping** (enum is `'A'|'B'|'C'`):
     - `iyi` / `good` / `kaliteli` / `A` → `'A'`
     - `orta` / `medium` / `B` → `'B'`
     - `düşük` / `dusuk` / `kötü` / `kotu` / `low` / `C` → `'C'`
     - missing or unrecognized → default `'A'`
   - On success: insert `harvest_entries` (costs `'{}'::jsonb`, quality from mapping), strip block, append `"✅ Günlük kaydınız oluşturuldu."`.
   - Parcel unresolvable: strip block, replace reply with `"Hangi parselden hasat ettiniz? Parsellerin: <list>"`, do not insert.
9. Insert two rows in `ai_chat_messages` (`role='user'` + `role='assistant'`, `source='whatsapp'`, `page_context='whatsapp'`, shared `session_id`).
10. RPC `increment_ai_usage(user_id)` only after successful AI response.
11. Return TwiML 200, `Content-Type: text/xml`, reply XML-escaped and truncated to 1600 chars. Always 200, even on errors.

### Session ID — daily session per user

Deterministic UUID derived from SHA-256 of `${user_id}:${YYYY-MM-DD UTC}`, formatted as a v4-style UUID. Same `session_id` for all messages from a user on a given calendar day. Rationale: WhatsApp has no native session boundary; daily granularity gives the in-app P10 chat view a natural conversation grouping while keeping context windows bounded. The in-app chat will mint its own session UUID per chat open.

### Error handling

- AI non-2xx / throw → generic Turkish error reply, skip storage and increment, return 200.
- Context-fetch DB failures → continue with empty context, log.
- Message-insert / increment failures → log, still send the reply.
- Always TwiML 200 (Twilio retries on non-200 → duplicates).
- No stack traces in user-facing replies.

## Secrets

All required secrets already present — nothing to add:

| Secret | Status | Used for |
|---|---|---|
| `SUPABASE_URL` | auto | Supabase client |
| `SUPABASE_SERVICE_ROLE_KEY` | auto | Service-role client |
| `LOVABLE_API_KEY` | already set | AI Gateway auth |

Twilio outbound creds not needed (TwiML synchronous reply). Signature validation deferred.

## Twilio Console configuration

Webhook URL:
```
https://efuqpiaavrzimvstpdpm.supabase.co/functions/v1/whatsapp-ai-webhook
```

Steps:
1. **Messaging → Senders → WhatsApp senders** (production) or **Messaging → Try it out → WhatsApp Sandbox Settings** (testing).
2. Open the WhatsApp-enabled number / sandbox config.
3. **"When a message comes in"**: paste the URL above. Method: **HTTP POST**.
4. **Status callback URL**: leave blank.
5. Save. (Sandbox: farmer sends `join <sandbox-code>` once to opt in.)

## Out of scope

- No frontend changes.
- No DB schema changes.
- No edits to `send-sms` or any existing function.
- No Twilio signature validation.
- No outbound proactive messaging.

## Files changed

- `supabase/functions/whatsapp-ai-webhook/index.ts` (new)
- `supabase/config.toml` (add `[functions.whatsapp-ai-webhook] verify_jwt = false`)
