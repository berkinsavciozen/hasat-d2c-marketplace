## Fix AI hallucinating dates for journal entries

Inject today's server date into both AI system prompts and add client-side validation as a safety net.

### 1. `supabase/functions/ai-chat-stream/index.ts`
- Compute `const today = new Date().toISOString().split('T')[0]` before building the system prompt.
- Prepend to system prompt: `Bugünün tarihi: ${today}. Tarih belirtilmediğinde bu tarihi kullan.`
- Redeploy edge function.

### 2. `supabase/functions/whatsapp-ai-webhook/index.ts`
- Already computes `today`. Add the same explicit instruction line near the top of the system prompt: `Bugünün tarihi: ${today}. Tarih belirtilmediğinde bu tarihi kullan.`
- Redeploy edge function.

### 3. `src/components/hasat/ai-chat/parseJournalEntry.ts`
- `todayISO()` already exists and is the fallback when `harvest_date` is missing/unparseable — keep as-is.
- After computing `date`, add validation: parse the year; if `< 2024` or `> currentYear + 1`, log `console.warn("AI returned suspicious date, defaulting to today:", date)` and replace with `todayISO()`.

### Constraints
- No DB, no UI changes.
- Only the three files above.

### Verification
- Send "12 gram safran hasat ettim" in chat → card pre-fills with 2026-06-25.
- AI prose no longer mentions a 2024/2025 date.
